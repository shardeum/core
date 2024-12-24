export function reversed<T>(thing: Iterable<T>): Iterable<T> {
    const arr = Array.isArray(thing) ? thing : Array.from(thing);
    let i = arr.length - 1;
    const reverseIterator = {
        next: () => {
            const done = i < 0;
            const value = done ? undefined : arr[i];
            i--;
            return { value, done };
        },
    };
    return {
        [Symbol.iterator]: () => reverseIterator,
    };
}
export function randomShifted<T>(thing: Iterable<T>): Iterable<T> {
    const arr = Array.isArray(thing) ? thing : Array.from(thing);
    let i = arr.length - 1;
    const reverseIterator = {
        next: () => {
            const done = i < 0;
            const value = done ? undefined : arr[i];
            i--;
            return { value, done };
        },
    };
    return {
        [Symbol.iterator]: () => reverseIterator,
    };
}
export function* shuffleMapIterator<K, V>(map: Map<K, V>): IterableIterator<V> {
    const keys = Array.from(map.keys());
    for (let i = keys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    for (const key of keys) {
        yield map.get(key);
    }
}