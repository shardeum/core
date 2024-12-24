export function isIPv6(ip: string): boolean {
    const slicedArr = ip.split(':');
    if (slicedArr.length !== 8)
        return false;
    for (const str of slicedArr) {
        const hexRegex = /^[0-9A-Fa-f]+$/;
        if (str.length < 0 || str.length > 4)
            return false;
        if (str.match(hexRegex) == null)
            return false;
    }
    return true;
}
export function isBogonIP(ip): boolean {
    let ipArr;
    try {
        ipArr = getIpArr(ip);
    }
    catch (e) {
        return true;
    }
    return isPrivateIP(ipArr) || isReservedIP(ipArr);
}
export function isInvalidIP(ip): boolean {
    let ipArr;
    try {
        ipArr = getIpArr(ip);
    }
    catch (e) {
        return true;
    }
    return isReservedIP(ipArr);
}
function getIpArr(ip: string): number[] {
    const slicedArr = ip.split('.');
    if (slicedArr.length !== 4) {
        throw new Error('Invalid IP address provided');
    }
    for (const number of slicedArr) {
        const num = Number(number);
        if (num.toString() !== number) {
            throw new Error('Leading zero detected. Invalid IP address');
        }
        if (num < 0 || num > 255) {
            throw new Error('Invalid IP address provided');
        }
    }
    const numArray = [Number(slicedArr[0]), Number(slicedArr[1]), Number(slicedArr[2]), Number(slicedArr[3])];
    return numArray;
}
function isPrivateIP(ip): boolean {
    return (ip[0] === 10 ||
        (ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127) ||
        ip[0] === 127 ||
        (ip[0] === 169 && ip[1] === 254) ||
        (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) ||
        (ip[0] === 192 && ip[1] === 168));
}
function isReservedIP(ip): boolean {
    return (ip[0] === 0 ||
        (ip[0] === 192 && ip[1] === 0 && ip[2] === 0) ||
        (ip[0] === 192 && ip[1] === 0 && ip[2] === 2) ||
        (ip[0] === 198 && ip[1] >= 18 && ip[1] <= 19) ||
        (ip[0] === 198 && ip[1] === 51 && ip[2] === 100) ||
        (ip[0] === 203 && ip[1] === 0 && ip[2] === 113) ||
        (ip[0] >= 224 && ip[0] <= 239) ||
        ip[0] >= 240 ||
        (ip[0] === 255 && ip[1] === 255 && ip[2] === 255 && ip[3] === 255));
}