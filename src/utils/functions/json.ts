import { Utils } from '@shardus/types';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
export const readJSON = <T>(filename): T => {
    const file = readFileSync(filename).toString();
    const config = Utils.safeJsonParse(file);
    return config;
};
export const readJSONDir = (dir): Record<string, unknown> => {
    const filesObj = {};
    readdirSync(dir).forEach((fileName) => {
        const name = fileName.split('.')[0];
        filesObj[name] = readJSON(join(dir, fileName));
    });
    return filesObj;
};