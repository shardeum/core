import { Console } from 'console';
import { PassThrough } from 'stream';
import { join } from 'path';
import { RollingFileStream } from 'streamroller';
export function startSaving(baseDir: string): void {
    const outFileName = `out.log`;
    const stream = new RollingFileStream(join(baseDir, outFileName), 10000000, 10);
    const outPass = new PassThrough();
    outPass.pipe(process.stdout);
    outPass.pipe(stream);
    const errPass = new PassThrough();
    errPass.pipe(process.stderr);
    errPass.pipe(stream);
    console = new Console({ stdout: outPass, stderr: errPass });
}