import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { hexstring, P2P, Utils } from '@shardus/types';
import { getCycleDataFromNode, initLogger, robustQueryForCycleRecordHash, robustQueryForValidatorListHash, getValidatorListFromNode, getArchiverListFromNode, robustQueryForArchiverListHash, robustQueryForStandbyNodeListHash, getStandbyNodeListFromNode, robustQueryForTxListHash, getTxListFromNode, } from './queries';
import { verifyArchiverList, verifyCycleRecord, verifyTxList, verifyValidatorList } from './verify';
import * as Archivers from '../Archivers';
import * as NodeList from '../NodeList';
import * as CycleChain from '../CycleChain';
import * as ServiceQueue from '../ServiceQueue';
import { initRoutes } from './routes';
import { digestCycle } from '../Sync';
import { JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { addStandbyJoinRequests } from '../Join/v2';
import { logFlags } from '../../logger';
import { makeCycleMarker } from '../CycleCreator';
import { p2pLogger } from './queries';
export function init(): void {
    initLogger();
    initRoutes();
}
export function syncV2(activeNodes: P2P.SyncTypes.ActiveNode[]): ResultAsync<void, Error> {
    return syncValidValidatorList(activeNodes).andThen(([validatorList, validatorListHash]) => syncArchiverList(activeNodes).andThen(([archiverList, archiverListHash]) => syncStandbyNodeList(activeNodes).andThen((standbyNodeList) => syncTxList(activeNodes).andThen((txList) => syncLatestCycleRecord(activeNodes).andThen((cycle) => {
        if (cycle.nodeListHash !== validatorListHash) {
            return errAsync(new Error(`validator list hash from received cycle (${cycle.nodeListHash}) does not match the hash received from robust query (${validatorListHash})`));
        }
        else if (cycle.archiverListHash !== archiverListHash) {
            return errAsync(new Error(`archiver list hash from received cycle (${cycle.archiverListHash}) does not match the hash received from robust query (${archiverListHash})`));
        }
        NodeList.reset('syncV2');
        NodeList.addNodes(validatorList, 'syncV2');
        for (const archiver of archiverList) {
            Archivers.archivers.set(archiver.publicKey, archiver);
        }
        addStandbyJoinRequests(standbyNodeList, true);
        ServiceQueue.setTxList(txList);
        CycleChain.reset();
        info('syncV2: cycle.counter ', cycle.counter);
        info('syncV2: cycle.marker ', makeCycleMarker(cycle));
        info('syncV2: nodelist hash ', cycle.nodeListHash);
        info('syncV2: archiverList hash ', cycle.archiverListHash);
        info('syncV2: standbyNodeList hash ', cycle.standbyNodeListHash);
        info('syncV2: cycle ', Utils.safeStringify(cycle));
        digestCycle(cycle, 'syncV2');
        info('syncV2: CycleChain.newest.counter ', CycleChain.newest.counter);
        info('syncV2: CycleChain.newest.marker ', makeCycleMarker(CycleChain.newest));
        info('syncV2: nodelist hash ', CycleChain.newest.nodeListHash);
        info('syncV2: archiverList hash ', CycleChain.newest.archiverListHash);
        info('syncV2: standbyNodeList hash ', CycleChain.newest.standbyNodeListHash);
        info('syncV2: CycleChain.newest ', Utils.safeStringify(CycleChain.newest));
        return okAsync(void 0);
    })))));
}
function syncValidValidatorList(activeNodes: P2P.SyncTypes.ActiveNode[]): ResultAsync<[
    P2P.NodeListTypes.Node[],
    hexstring
], Error> {
    return robustQueryForValidatorListHash(activeNodes).andThen(({ value, winningNodes }) => getValidatorListFromNode(winningNodes[0], value.nodeListHash).andThen((nodeList) => verifyValidatorList(nodeList, value.nodeListHash).map(() => [nodeList, value.nodeListHash] as [
        P2P.NodeListTypes.Node[],
        hexstring
    ])));
}
function syncArchiverList(activeNodes: P2P.SyncTypes.ActiveNode[]): ResultAsync<[
    P2P.ArchiversTypes.JoinedArchiver[],
    hexstring
], Error> {
    return robustQueryForArchiverListHash(activeNodes).andThen(({ value, winningNodes }) => getArchiverListFromNode(winningNodes[0], value.archiverListHash).andThen((archiverList) => verifyArchiverList(archiverList, value.archiverListHash).map(() => [archiverList, value.archiverListHash] as [
        P2P.ArchiversTypes.JoinedArchiver[],
        hexstring
    ])));
}
function syncStandbyNodeList(activeNodes: P2P.SyncTypes.ActiveNode[]): ResultAsync<JoinRequest[], Error> {
    return robustQueryForStandbyNodeListHash(activeNodes).andThen(({ value, winningNodes }) => {
        return getStandbyNodeListFromNode(winningNodes[0], value.standbyNodeListHash);
    });
}
function syncTxList(activeNodes: P2P.SyncTypes.ActiveNode[]): ResultAsync<{
    hash: string;
    tx: P2P.ServiceQueueTypes.AddNetworkTx;
}[], Error> {
    return robustQueryForTxListHash(activeNodes).andThen(({ value, winningNodes }) => getTxListFromNode(winningNodes[0], value.txListHash).andThen((txList) => verifyTxList(txList, value.txListHash).map(() => txList)));
}
function syncLatestCycleRecord(activeNodes: P2P.SyncTypes.ActiveNode[]): ResultAsync<P2P.CycleCreatorTypes.CycleRecord, Error> {
    return robustQueryForCycleRecordHash(activeNodes).andThen(({ value, winningNodes }) => getCycleDataFromNode(winningNodes[0], value.currentCycleHash).andThen((cycle) => verifyCycleRecord(cycle, value.currentCycleHash).map(() => cycle)));
}
function info(...msg) {
    const entry = `SyncV2: ${msg.join(' ')}`;
}