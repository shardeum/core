import * as crypto from '@shardus/crypto-utils';
import { ChildProcess, fork, Serializable } from 'child_process';
import fs from 'fs';
import Log4js from 'log4js';
import path from 'path';
import Logger, { logFlags } from '../logger';
import * as Shardus from '../shardus/shardus-types';
import Storage from '../storage';
import { Utils } from '@shardus/types';
export type HashableObject = (object | string) & {
    sign?: Shardus.Sign;
};
interface Keypair {
    publicKey?: crypto.publicKey;
    secretKey?: crypto.secretKey;
}
interface Crypto {
    baseDir: string;
    config: Shardus.StrictServerConfiguration;
    mainLogger: Log4js.Logger;
    storage: Storage;
    keypair: Keypair;
    curveKeypair: {
        publicKey?: crypto.curvePublicKey;
        secretKey?: crypto.curveSecretKey;
    };
    powGenerators: {
        [name: string]: ChildProcess;
    };
    sharedKeys: {
        [name: string]: Buffer;
    };
}
class Crypto {
    constructor(baseDir: string, config: Shardus.StrictServerConfiguration, logger: Logger, storage: Storage) {
        this.baseDir = baseDir;
        this.config = config;
        this.mainLogger = logger.getLogger('main');
        this.storage = storage;
        this.keypair = {};
        this.curveKeypair = {};
        this.powGenerators = {};
        this.sharedKeys = {};
    }
    async init(): Promise<void> {
        crypto.init(this.config.crypto.hashKey);
        crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify');
        try {
            this.storage._checkInit();
            const keypair = await this.storage.getProperty('keypair');
            if (keypair) {
                this.keypair = keypair;
                this.setCurveKeyPair(this.keypair);
                return;
            }
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error(`error fetching keypair from database ${Utils.safeStringify(e)}`);
        }
        if (this.config.crypto.keyPairConfig.useKeyPairFromFile) {
            const fsKeypair = this.readKeypairFromFile();
            if (fsKeypair && fsKeypair.secretKey && fsKeypair.publicKey) {
                this.keypair = fsKeypair;
                this.setCurveKeyPair(this.keypair);
                return;
            }
        }
        try {
            this.keypair = this._generateKeypair();
            if (this.config.crypto.keyPairConfig.useKeyPairFromFile)
                this.writeKeypairToFile(this.keypair);
            await this.storage.setProperty('keypair', this.keypair);
            this.setCurveKeyPair(this.keypair);
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error(`error ${Utils.safeStringify(e)}`);
        }
    }
    setCurveKeyPair(keypair: Keypair): void {
        if (keypair) {
            this.curveKeypair = {
                secretKey: crypto.convertSkToCurve(this.keypair.secretKey),
                publicKey: crypto.convertPkToCurve(this.keypair.publicKey),
            };
        }
    }
    getKeyPairFile(): string {
        return path.join(this.baseDir, this.config.crypto.keyPairConfig.keyPairJsonFile);
    }
    writeKeypairToFile(keypair: Keypair): void {
        fs.writeFileSync(this.getKeyPairFile(), Utils.safeStringify(keypair));
    }
    readKeypairFromFile(): crypto.Keypair {
        if (fs.existsSync(this.getKeyPairFile())) {
            const fileData = fs.readFileSync(this.getKeyPairFile());
            return Utils.safeJsonParse(fileData.toString());
        }
        return null;
    }
    _generateKeypair(): crypto.Keypair {
        const keypair = crypto.generateKeypair();
        return keypair;
    }
    convertPublicKeyToCurve(pk: crypto.publicKey): string {
        return crypto.convertPkToCurve(pk);
    }
    getPublicKey(): string {
        return this.keypair.publicKey;
    }
    getCurvePublicKey(): string {
        return this.curveKeypair.publicKey;
    }
    getSharedKey(curvePk: crypto.curvePublicKey): Buffer {
        let sharedKey = this.sharedKeys[curvePk];
        if (!sharedKey) {
            sharedKey = crypto.generateSharedKey(this.curveKeypair.secretKey, curvePk);
            this.sharedKeys[curvePk] = sharedKey;
        }
        return sharedKey;
    }
    tag<T>(obj: T, recipientCurvePk: crypto.curvePublicKey): T & crypto.TaggedObject {
        const objCopy = Utils.safeJsonParse(Utils.safeStringify(obj));
        const sharedKey = this.getSharedKey(recipientCurvePk);
        crypto.tagObj(objCopy, sharedKey);
        return objCopy;
    }
    tagWithSize<T>(obj: T, recipientCurvePk: crypto.curvePublicKey): T & {
        msgSize: number;
    } & crypto.TaggedObject {
        const strEncoded = Utils.safeStringify(obj);
        const msgSize = strEncoded.length;
        const objCopy = Utils.safeJsonParse(strEncoded);
        objCopy.msgSize = msgSize;
        const sharedKey = this.getSharedKey(recipientCurvePk);
        crypto.tagObj(objCopy, sharedKey);
        return objCopy;
    }
    signWithSize<T>(obj: T): T & crypto.SignedObject {
        const wrappedMsgStr = Utils.safeStringify(obj);
        const msgLength = wrappedMsgStr.length;
        // @ts-ignore
        obj.msgSize = msgLength;
        return this.sign(obj);
    }
    authenticate(obj: crypto.TaggedObject, senderCurvePk: crypto.curvePublicKey): boolean {
        const sharedKey = this.getSharedKey(senderCurvePk);
        return crypto.authenticateObj(obj, sharedKey);
    }
    sign<T>(obj: T): T & crypto.SignedObject {
        const objCopy = Utils.safeJsonParse(Utils.safeStringify(obj));
        crypto.signObj(objCopy, this.keypair.secretKey, this.keypair.publicKey);
        return objCopy;
    }
    verify(obj: crypto.SignedObject, expectedPk?: string): boolean {
        try {
            if (expectedPk) {
                if (obj.sign.owner !== expectedPk)
                    return false;
            }
            return crypto.verifyObj(obj);
        }
        catch (e) {
            this.mainLogger.error(`Error in verifying object ${Utils.safeStringify(obj)}`, e);
            return false;
        }
    }
    hash(obj: HashableObject): string {
        if (typeof obj === 'string') {
            return crypto.hash(obj);
        }
        if (!obj.sign) {
            return crypto.hashObj(obj);
        }
        return crypto.hashObj(obj, true);
    }
    isGreaterHash(hash1: string | number, hash2: string | number): boolean {
        return hash1 > hash2;
    }
    getComputeProofOfWork(seed: unknown, difficulty: number): Promise<Serializable> {
        return this._runProofOfWorkGenerator('./computePowGenerator.js', seed, difficulty);
    }
    stopAllGenerators(): void {
        for (const generator in this.powGenerators) {
            this.powGenerators[generator].kill();
        }
        this.powGenerators = {};
    }
    _runProofOfWorkGenerator(generator: string, seed: unknown, difficulty: number): Promise<Serializable> {
        if (!this.powGenerators[generator]) {
            this.powGenerators[generator] = fork(generator, undefined, { cwd: __dirname });
        }
        const promise = new Promise<Serializable>((resolve) => {
            this.powGenerators[generator].on('message', (powObj: Serializable) => {
                this._stopProofOfWorkGenerator(generator);
                resolve(powObj);
            });
        });
        if (!this.powGenerators[generator].killed) {
            this.powGenerators[generator].send({ seed, difficulty });
        }
        return promise;
    }
    _stopProofOfWorkGenerator(generator: string): Promise<number | string> {
        if (!this.powGenerators[generator])
            return Promise.resolve('not running');
        const promise = new Promise<number | string>((resolve) => {
            this.powGenerators[generator].on('close', (signal) => {
                delete this.powGenerators[generator];
                resolve(signal);
            });
        });
        if (!this.powGenerators[generator].killed) {
            this.powGenerators[generator].kill();
        }
        return promise;
    }
}
export default Crypto;