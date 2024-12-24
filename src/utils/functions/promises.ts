export const robustPromiseAll = async <T, E = Error>(promises: Promise<T>[]): Promise<[
    T[],
    E[]
]> => {
    const wrapPromise = async <T, E = Error>(promise: Promise<T>): Promise<[
        T
    ] | [
        null,
        E
    ]> => {
        try {
            const result = await promise;
            return [result];
        }
        catch (e) {
            return [null, e];
        }
    };
    const wrappedPromises = [];
    for (const promise of promises) {
        wrappedPromises.push(wrapPromise(promise));
    }
    const resolved = [];
    const errors = [];
    const wrappedResults = await Promise.all(wrappedPromises);
    for (const wrapped of wrappedResults) {
        const [result, err] = wrapped;
        if (err) {
            errors.push(err);
            continue;
        }
        resolved.push(result);
    }
    return [resolved, errors];
};
export const groupResolvePromises = async <T, E = Error>(promiseList: Promise<T>[], evaluationFn: (res: T) => boolean, maxLosses: number, minWins: number): Promise<{
    success: boolean;
    wins: T[];
    losses: T[];
    errors: E[];
}> => {
    const wins: T[] = [];
    const losses: T[] = [];
    let winCount = 0;
    let lossCount = 0;
    const errs = [];
    return new Promise((resolve) => {
        for (let i = 0; i < promiseList.length; i++) {
            const promise = promiseList[i];
            promise
                .then((value) => {
                const evalStatus = evaluationFn(value);
                if (evalStatus) {
                    wins.push(value);
                    winCount++;
                }
                else {
                    losses.push(value);
                    lossCount++;
                }
                const status = computePromiseGroupStatus(winCount, minWins, lossCount, maxLosses);
                if (status != undefined) {
                    resolve({
                        success: status,
                        wins: wins,
                        losses: losses,
                        errors: errs,
                    });
                }
            })
                .catch((error) => {
                errs.push(error);
                lossCount++;
                const status = computePromiseGroupStatus(winCount, minWins, lossCount, maxLosses);
                if (status != undefined) {
                    resolve({
                        success: status,
                        wins: wins,
                        losses: losses,
                        errors: errs,
                    });
                }
            });
        }
    });
};
const computePromiseGroupStatus = (winCount: number, minWins: number, lossCount: number, maxLosses: number): boolean | undefined => {
    if (winCount >= minWins)
        return true;
    if (lossCount >= maxLosses)
        return false;
    return undefined;
};
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T | 'timeout'> {
    let timer: NodeJS.Timeout | undefined;
    const promise = fn();
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            clearTimeout(timer);
            reject(new Error('Timeout'));
        }, timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        if (timer) {
            clearTimeout(timer);
        }
        return result;
    }
    catch (err) {
        if (timer) {
            clearTimeout(timer);
        }
        return 'timeout';
    }
}