import { P2P } from '@shardus/types';
import { Ordering } from '..';
import { Response } from 'express-serve-static-core';
import { DevSecurityLevel, NodeWithRank } from '../../shardus/shardus-types';
import { nestedCountersInstance } from '../nestedCounters';
import { Utils } from '@shardus/types';
export const isValidIPv4 = (ip: string): boolean => {
    const ipv4Regex = new RegExp('^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$');
    return ipv4Regex.test(ip);
};
export const appdata_replacer = <T, K, V>(_key, value: Map<K, V> | T): {
    dataType: 'stringifyReduce_map_2_array';
    value: [
        K,
        V
    ][];
} | T | string => {
    const originalObject = value;
    if (originalObject instanceof Map) {
        return {
            dataType: 'stringifyReduce_map_2_array',
            value: Array.from(originalObject.entries()),
        };
    }
    else if (typeof originalObject === 'bigint') {
        return originalObject.toString();
    }
    else if (originalObject instanceof Uint8Array) {
        const buffer = Buffer.from(originalObject);
        return buffer.toString('hex');
    }
    else {
        return value as T;
    }
};
export const deepCopy = <T>(obj: T): T => {
    if (typeof obj !== 'object') {
        throw Error('Given element is not of type object.');
    }
    return Utils.safeJsonParse(Utils.safeStringify(obj));
};
export const mod = (n, m): number => {
    return ((n % m) + m) % m;
};
export const lerp = (v0: number, v1: number, a: number): number => {
    return v0 * (1 - a) + v1 * a;
};
export function propComparator<T>(prop: keyof T): (a: T, b: T) => Ordering {
    const comparator = (a: T, b: T): Ordering => (a[prop] > b[prop] ? 1 : a[prop] < b[prop] ? -1 : 0);
    return comparator;
}
export function propComparator2<T>(prop: keyof T, prop2: keyof T): (a: T, b: T) => Ordering {
    const comparator = (a: T, b: T): Ordering => a[prop] === b[prop]
        ? a[prop2] === b[prop2]
            ? 0
            : a[prop2] > b[prop2]
                ? 1
                : -1
        : a[prop] > b[prop]
            ? 1
            : -1;
    return comparator;
}
export const XOR = (hexString1, hexString2): number => {
    const num1 = parseInt(hexString1.substring(0, 8), 16);
    const num2 = parseInt(hexString2.substring(0, 8), 16);
    return (num1 ^ num2) >>> 0;
};
export const getClosestHash = (targetHash, hashes): string => {
    let closest = null;
    let closestDist = 0;
    for (const hash of hashes) {
        const dist = XOR(targetHash, hash);
        if (dist === closestDist) {
            console.error(new Error(`Two hashes came out to the same distance from target hash!\n 1st hash: ${closest}\n 2nd hash: ${hash}\n Target hash: ${targetHash}`));
            return null;
        }
        if (dist > closestDist)
            closest = hash;
        closestDist = dist;
    }
    return closest;
};
export const makeShortHash = (x, n = 4): string => {
    if (!x) {
        return x;
    }
    if (x.length > 63) {
        if (x.length === 64) {
            return x.slice(0, n) + 'x' + x.slice(63 - n);
        }
        else if (x.length === 128) {
            return x.slice(0, n) + 'xx' + x.slice(127 - n);
        }
        else if (x.length === 192) {
            return x.slice(0, n) + 'xx' + x.slice(191 - n);
        }
    }
    return x;
};
export const short = (x: string, n = 4): string => {
    if (!x) {
        return x;
    }
    return x.slice(0, n * 2);
};
export const debugExpand = (value: string): string => {
    const res = value.slice(0, 4) + '0'.repeat(55) + value.slice(5, 5 + 5);
    return res;
};
export const selectNeighbors = (array: any[], ourIndex: number, neighborsOnEachSide: number): any[] => {
    const length = array.length;
    const neighbors = [];
    if (length === 0)
        return neighbors;
    if (length <= neighborsOnEachSide * 2)
        return array.slice();
    try {
        for (let i = 1; i <= neighborsOnEachSide; i++) {
            const leftIndex = (ourIndex - i + length) % length;
            const rightIndex = (ourIndex + i) % length;
            if (leftIndex !== ourIndex) {
                neighbors.push(array[leftIndex]);
            }
            if (rightIndex !== ourIndex && rightIndex !== leftIndex) {
                neighbors.push(array[rightIndex]);
            }
        }
    }
    catch (e) {
        console.error(`Error selecting neighbors nodes: ${e.message}`);
    }
    return neighbors;
};
export function validateTypes(inp, def): string {
    if (inp === undefined)
        return 'input is undefined';
    if (inp === null)
        return 'input is null';
    if (typeof inp !== 'object')
        return 'input must be object, not ' + typeof inp;
    const map = {
        string: 's',
        number: 'n',
        boolean: 'b',
        bigint: 'B',
        array: 'a',
        object: 'o',
    };
    const imap = {
        s: 'string',
        n: 'number',
        b: 'boolean',
        B: 'bigint',
        a: 'array',
        o: 'object',
    };
    const fields = Object.keys(def);
    for (const name of fields) {
        const types = def[name];
        const opt = types.substr(-1, 1) === '?' ? 1 : 0;
        if (inp[name] === undefined && !opt)
            return name + ' is required';
        if (inp[name] !== undefined) {
            if (inp[name] === null && !opt)
                return name + ' cannot be null';
            let found = 0;
            let be = '';
            for (let t = 0; t < types.length - opt; t++) {
                let it = map[typeof inp[name]];
                it = Array.isArray(inp[name]) ? 'a' : it;
                const is = types.substr(t, 1);
                if (it === is) {
                    found = 1;
                    break;
                }
                else
                    be += ', ' + imap[is];
            }
            if (!found)
                return name + ' must be' + be;
        }
    }
    return '';
}
export function errorToStringFull(error): string {
    return `${error.name}: ${error.message} at ${error.stack}`;
}
export function sumObject(sumObject, toAddObject): void {
    for (const [key, val] of Object.entries(sumObject)) {
        const otherVal = toAddObject[key];
        if (otherVal == null) {
            continue;
        }
        switch (typeof val) {
            case 'number':
                sumObject[key] = val + otherVal;
                break;
            default:
                break;
        }
    }
}
export function generateObjectSchema(obj, options = { arrTypeDiversity: false }): object {
    const schema = {};
    if (Array.isArray(obj)) {
        throw new Error('Object schema generation function does not accept array as argument');
    }
    for (const [key, value] of Object.entries(obj)) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null) {
            if ((key === 'devPublicKeys' || key === 'multisigKeys') && isDevPublicKeysValid(schema[key])) {
                schema[key] = '{ [publicKey: string]: DevSecurityLevel }';
            }
            else if (value.constructor === Object) {
                schema[key] = generateObjectSchema(value, { arrTypeDiversity: options.arrTypeDiversity });
            }
            else if (Array.isArray(value)) {
                schema[key] = generateArraySchema(value, { diversity: options.arrTypeDiversity });
            }
            else {
                schema[key] = typeof value;
            }
        }
    }
    return schema;
}
function isDevPublicKeysValid(devPublicKeys: {
    [publicKey: string]: DevSecurityLevel;
}): boolean {
    for (const key in devPublicKeys) {
        if (typeof devPublicKeys[key] !== 'number') {
            return false;
        }
    }
    return true;
}
export function generateArraySchema(arr: unknown[], options = { diversity: false }): string {
    let schema: string;
    for (let i = 0; i < arr.length; i++) {
        if (i > 0 && arr[i].constructor !== arr[i - 1].constructor) {
            if (options.diversity) {
                return 'any[]';
            }
            else {
                throw new Error('Array schema generation does not allowed type diversities in an array unless specified');
            }
        }
        const IS_MULTI_DIMENSIONAL = Array.isArray(arr[i]);
        if (arr[i].constructor === Object) {
            schema = '{}[]';
        }
        else if (IS_MULTI_DIMENSIONAL) {
            schema = 'array[]';
        }
        else {
            schema = `${typeof arr[i]}[]`;
        }
    }
    return schema;
}
export function compareObjectShape(idol, admirer): {
    isValid: true;
    error?: {
        defectoChain: string[];
        defectiveChain: Array<string>;
    };
} {
    let isValid;
    let error = undefined;
    const defectoChain = [];
    let idol_schema;
    try {
        idol_schema = generateObjectSchema(idol, { arrTypeDiversity: false });
    }
    catch (e) {
        throw new Error('Type varies array detected inside idol object');
    }
    const admirer_schema = generateObjectSchema(admirer, { arrTypeDiversity: true });
    if (Utils.safeStringify(idol_schema) === Utils.safeStringify(admirer_schema)) {
        isValid = true;
        return { isValid, error };
    }
    const smartComparator = (idol_type, admirer_type): boolean => {
        if (typeof idol_type === 'object' && idol_type.constructor === Object) {
            return Utils.safeStringify(idol_type) === Utils.safeStringify(admirer_type);
        }
        else {
            return idol_type === admirer_type;
        }
    };
    const defectoHunter = (worshipped, worshipper): {
        [x: string]: object;
    } => {
        const l1 = Object.keys(worshipped).length;
        const l2 = Object.keys(worshipper).length;
        const bigger_obj = l1 >= l2 ? worshipped : worshipper;
        for (const key in bigger_obj) {
            const DEFECTOR_FOUND = smartComparator(worshipped[key], worshipper[key]) === false;
            if (DEFECTOR_FOUND) {
                defectoChain.push(key);
                if (Object.prototype.hasOwnProperty.call(worshipped, key) && worshipped[key].constructor === Object) {
                    return defectoHunter(worshipped[key], worshipper[key]);
                }
                else {
                    return { [key]: worshipper[key] };
                }
            }
        }
    };
    error = {
        defectiveProp: defectoHunter(idol_schema, admirer_schema),
        defectiveChain: defectoChain,
    };
    isValid = false;
    return { isValid, error };
}
export function isEqualOrNewerVersion(oldVer: string, newVer: string): boolean {
    if (oldVer === newVer) {
        return true;
    }
    const oldParts = oldVer.split('.');
    const newParts = newVer.split('.');
    for (let i = 0; i < newParts.length; i++) {
        const a = ~~newParts[i];
        if (oldParts.length <= i)
            return false;
        const b = ~~oldParts[i];
        if (a > b)
            return true;
        if (a < b)
            return false;
    }
    return false;
}
export function humanFileSize(size: number): string {
    const i = Math.max(size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024)), 4);
    const value = Number(size / Math.pow(1024, i)).toFixed(2);
    return value + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
}
export function fastIsPicked(ourIndex: number, groupSize: number, numToPick: number, offset = 0): boolean {
    let isPicked = false;
    const fstride = groupSize / numToPick;
    const finalOffset = ourIndex + offset;
    let steps = finalOffset / fstride;
    steps = Math.round(steps);
    const fendPoint = steps * fstride;
    const endpoint = Math.round(fendPoint);
    if (endpoint === finalOffset) {
        isPicked = true;
    }
    return isPicked;
}
export function getIndexesPicked(groupSize: number, numToPick: number, offset = 0): number[] {
    const indexesPicked = [];
    for (let i = 0; i < groupSize; i++) {
        if (fastIsPicked(i, groupSize, numToPick, offset)) {
            indexesPicked.push(i);
        }
    }
    return indexesPicked;
}
export function selectIndexesWithOffeset(arraySize: number, numberToPick: number, offset: number): number[] {
    let currentIndex = mod(offset, arraySize);
    const strideAmount = Math.max(1, (offset + 1337) % Math.ceil(arraySize / numberToPick));
    const selectedIndexes = new Set<number>();
    while (selectedIndexes.size < numberToPick) {
        currentIndex += strideAmount;
        if (currentIndex >= arraySize) {
            currentIndex -= arraySize;
        }
        while (selectedIndexes.has(currentIndex)) {
            currentIndex++;
            if (currentIndex >= arraySize) {
                currentIndex = 0;
            }
        }
        selectedIndexes.add(currentIndex);
    }
    return Array.from(selectedIndexes);
}
export function formatErrorMessage(err: unknown, printStack: boolean = true): string {
    let errMsg = 'An error occurred';
    if (typeof err === 'string') {
        errMsg = err;
    }
    else if (err instanceof Error) {
        errMsg = err.message;
        if (printStack && err.stack) {
            errMsg += ` \nStack trace:\n${err.stack}`;
        }
    }
    else if (typeof err === 'object' && err !== null) {
        errMsg = `Unknown error: ${Utils.safeStringify(err)}`;
    }
    else {
        errMsg = `Unknown error: ${err}`;
    }
    return errMsg;
}
export function isValidShardusAddress(hexStrings: string[]): boolean {
    for (let i = 0; i < hexStrings.length; i++) {
        if (!(hexStrings[i].length === 64) || !(Buffer.from(hexStrings[i], 'hex').length === 32))
            return false;
    }
    return true;
}
export function logNode(node: P2P.NodeListTypes.Node | NodeWithRank): string {
    return `Node ID : ${node.id} externalPort : ${node.externalPort} externalIP : ${node.externalIp}`;
}
export function jsonHttpResWithSize(res: Response<unknown, Record<string, unknown>, number>, obj: object): number {
    const str = Utils.safeStringify(obj);
    res.setHeader('Content-Length', str.length);
    res.setHeader('Content-Type', 'application/json');
    res.write(str);
    res.end();
    return str.length;
}
export function stringForKeys(obj: unknown, keys: ArrayLike<string> | string | null = null): string {
    if (obj === undefined)
        return 'undefined';
    if (obj === null)
        return 'null';
    try {
        if (Array.isArray(obj))
            return `[${obj.map((item) => stringForKeys(item, keys)).join(', ')}]`;
        if (keys == null)
            keys = Object.keys(obj);
        else if (typeof keys == 'string')
            keys = keys.split(/[ ,]+/);
        const items = Array.from(keys)
            .map((key) => (obj[key] === undefined ? 'undefined' : Utils.safeStringify(obj[key])))
            .join(', ');
        return `{${items}}`;
    }
    catch (e) {
        let objStr: string;
        try {
            objStr = Utils.safeStringify(obj);
        }
        catch (e) {
            objStr = '(stringForKeys(): exception for Utils.safeStringify())';
        }
        return `(stringForKeys(): exception: ${e}, obj: ${objStr})`;
    }
}
export function getPrefixInt(hexAddress: string, length = 8): number {
    if (length < 1 || length > 8) {
        throw new Error("Length parameter should be between 1 and 8.");
    }
    const prefixHex = hexAddress.slice(0, length);
    const prefixInt = parseInt(prefixHex, 16);
    if (isNaN(prefixInt)) {
        throw new Error("Invalid hex characters in the input.");
    }
    return prefixInt;
}
export function testFailChance(failChance: number, debugName: string, key: string, message: string, verboseRequired: boolean): boolean {
    if (failChance == null) {
        return false;
    }
    const rand = Math.random();
    if (failChance > rand) {
        if (debugName != null) {
        }
        return true;
    }
    return false;
}