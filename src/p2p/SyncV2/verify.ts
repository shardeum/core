import { P2P, hexstring } from '@shardus/types';
import { err, ok, Result } from 'neverthrow';
import { HashableObject } from '../../crypto';
import { crypto } from '../Context';
import { makeCycleMarker } from '../CycleCreator';
import { Utils } from '@shardus/types';
function verify(object: HashableObject, expectedHash: hexstring, objectName = 'some object'): Result<boolean, Error> {
    const newHash = crypto.hash(object);
    return newHash === expectedHash
        ? ok(true)
        : err(new Error(`hash mismatch for ${objectName}: expected ${expectedHash}, got ${newHash}`));
}
export function verifyValidatorList(validatorList: P2P.NodeListTypes.Node[], expectedHash: hexstring): Result<boolean, Error> {
    return verify(validatorList, expectedHash, 'validator list');
}
export function verifyArchiverList(archiverList: P2P.ArchiversTypes.JoinedArchiver[], expectedHash: hexstring): Result<boolean, Error> {
    return verify(archiverList, expectedHash, 'archiver list');
}
export function verifyCycleRecord(cycleRecord: P2P.CycleCreatorTypes.CycleRecord, expectedHash: hexstring): Result<boolean, Error> {
    const actualHash = makeCycleMarker(cycleRecord);
    if (actualHash !== expectedHash)
        return err(new Error(`hash mismatch for cycle: expected ${expectedHash}, got ${actualHash}`));
    return ok(true);
}
export function verifyTxList(txList: {
    hash: string;
    tx: P2P.ServiceQueueTypes.AddNetworkTx;
}[], expectedHash: hexstring): Result<boolean, Error> {
    const actualHash = crypto.hash(txList);
    if (actualHash !== expectedHash)
        return err(new Error(`hash mismatch for txList: expected ${expectedHash}, got ${actualHash}`));
    return ok(true);
}