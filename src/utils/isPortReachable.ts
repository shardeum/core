import net from 'node:net';
export const isPortReachable = async ({ host, port, timeout = 1000, }: {
    host: string;
    port: number;
    timeout?: number;
}): Promise<boolean> => {
    const promise = new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        const onError = (): void => {
            socket.destroy();
            reject();
        };
        socket.setTimeout(timeout);
        socket.once('error', onError);
        socket.once('timeout', onError);
        socket.connect(port, host, () => {
            socket.end();
            resolve();
        });
    });
    try {
        await promise;
        return true;
    }
    catch {
        return false;
    }
};