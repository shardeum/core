import { hexstring, P2P } from '@shardus/types';
import { errAsync, ResultAsync } from 'neverthrow';
import { attempt, robustQuery } from '../Utils';
import * as http from '../../http';
import { logger } from '../Context';
import { Logger } from 'log4js';
import { JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
export type RobustQueryResultAsync<T> = ResultAsync<UnwrappedRobustResult<ActiveNode, T>, Error>;
type UnwrappedRobustResult<N, V> = {
    winningNodes: N[];
    value: V;
};
type ActiveNode = P2P.SyncTypes.ActiveNode;
type Validator = P2P.NodeListTypes.Node;
type Archiver = P2P.ArchiversTypes.JoinedArchiver;
type CycleRecord = P2P.CycleCreatorTypes.CycleRecord;
const MAX_RETRIES = 3;
let mainLogger: Logger;
export let p2pLogger: Logger;
export function initLogger(): void {
    mainLogger = logger.getLogger('main');
    p2pLogger = logger.getLogger('p2p');
}
function makeRobustQueryCall<T>(nodes: ActiveNode[], endpointName: string): RobustQueryResultAsync<T> {
    const queryFn = (node: ActiveNode): ResultAsync<T, Error> => {
        const ip = node.ip;
        const port = node.port;
        return ResultAsync.fromPromise(http.get(`${ip}:${port}/${endpointName}`), (err) => new Error(`couldn't query ${endpointName}: ${err}`));
    };
    const logPrefix = `syncv2-robust-query-${endpointName}`;
    return ResultAsync.fromPromise(attempt(async () => await robustQuery(nodes, queryFn), {
        maxRetries: MAX_RETRIES,
        logPrefix,
        logger: mainLogger,
    }), (err) => new Error(`robust query failed for ${endpointName}: ${err}`)).andThen((robustResult) => {
        if (!robustResult.isRobustResult) {
            return errAsync(new Error(`result of ${endpointName} wasn't robust`));
        }
        return robustResult.topResult.map((value) => ({
            winningNodes: robustResult.winningNodes,
            value,
        }));
    });
}
function attemptSimpleFetch<T>(node: ActiveNode, endpointName: string, params: Record<string, string> = {}, timeout = 1000): ResultAsync<T, Error> {
    let url = `${node.ip}:${node.port}/${endpointName}`;
    if (params) {
        const encodedParams = new URLSearchParams(params).toString();
        url += `?${encodedParams}`;
    }
    return ResultAsync.fromPromise(attempt(async () => await http.get(url, false, timeout), {
        maxRetries: MAX_RETRIES,
        logPrefix: `syncv2-simple-fetch-${endpointName}`,
        logger: mainLogger,
    }), (err) => new Error(`simple fetch failed for ${endpointName}: ${err}`));
}
export function robustQueryForCycleRecordHash(nodes: ActiveNode[]): RobustQueryResultAsync<{
    currentCycleHash: hexstring;
}> {
    return makeRobustQueryCall(nodes, 'current-cycle-hash');
}
export function robustQueryForValidatorListHash(nodes: ActiveNode[]): RobustQueryResultAsync<{
    nodeListHash: hexstring;
    nextCycleTimestamp: number;
}> {
    return makeRobustQueryCall(nodes, 'validator-list-hash');
}
export function robustQueryForArchiverListHash(nodes: ActiveNode[]): RobustQueryResultAsync<{
    archiverListHash: hexstring;
}> {
    return makeRobustQueryCall(nodes, 'archiver-list-hash');
}
export function robustQueryForStandbyNodeListHash(nodes: ActiveNode[]): RobustQueryResultAsync<{
    standbyNodeListHash: hexstring;
}> {
    return makeRobustQueryCall(nodes, 'standby-list-hash');
}
export function robustQueryForTxListHash(nodes: ActiveNode[]): RobustQueryResultAsync<{
    txListHash: hexstring;
}> {
    return makeRobustQueryCall(nodes, 'tx-list-hash');
}
export function getCycleDataFromNode(node: ActiveNode, expectedMarker: hexstring): ResultAsync<CycleRecord, Error> {
    return attemptSimpleFetch(node, 'cycle-by-marker', {
        marker: expectedMarker,
    });
}
export function getValidatorListFromNode(node: ActiveNode, expectedHash: hexstring): ResultAsync<Validator[], Error> {
    return attemptSimpleFetch(node, 'validator-list', {
        hash: expectedHash,
    }, 10000);
}
export function getArchiverListFromNode(node: ActiveNode, expectedHash: hexstring): ResultAsync<Archiver[], Error> {
    return attemptSimpleFetch(node, 'archiver-list', {
        hash: expectedHash,
    });
}
export function getStandbyNodeListFromNode(node: ActiveNode, expectedHash: hexstring): ResultAsync<JoinRequest[], Error> {
    return attemptSimpleFetch(node, 'standby-list', {
        hash: expectedHash,
    }, 10000);
}
export function getTxListFromNode(node: ActiveNode, expectedHash: hexstring): ResultAsync<{
    hash: string;
    tx: P2P.ServiceQueueTypes.AddNetworkTx;
}[], Error> {
    return attemptSimpleFetch(node, 'tx-list', {
        hash: expectedHash,
    }, 10000);
}