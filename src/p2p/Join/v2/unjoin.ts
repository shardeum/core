import { crypto } from '../../Context';
import { err, ok, Result } from 'neverthrow';
import { hexstring } from '@shardus/types';
import * as utils from '../../../utils';
import * as http from '../../../http';
import * as NodeList from '../../NodeList';
import { deleteStandbyNodeFromMap, getStandbyNodesInfoMap } from '.';
import { getActiveNodesFromArchiver, getRandomAvailableArchiver } from '../../Utils';
import { logFlags } from '../../../logger';
import * as CycleChain from '../../CycleChain';
import { SignedUnjoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
const newUnjoinRequests: Set<SignedUnjoinRequest> = new Set();
export async function submitUnjoin(): Promise<Result<void, Error>> {
    const publicKey = crypto.keypair.publicKey;
    const foundInStandbyNodes = getStandbyNodesInfoMap().has(publicKey);
    if (!foundInStandbyNodes) {
        return err(new Error('node is not in standby. Do not send unjoin request'));
    }
    if (!CycleChain.getNewest()) {
        return err(new Error('No cycle chain found. Do not send unjoin request'));
    }
    const unjoinRequest = crypto.sign({
        publicKey: publicKey,
        cycleNumber: CycleChain.getNewest().counter,
    });
    const archiver = getRandomAvailableArchiver();
    try {
        const activeNodesResult = await getActiveNodesFromArchiver(archiver);
        if (activeNodesResult.isErr()) {
            return err(new Error(`couldn't get active nodes: ${activeNodesResult.error}`));
        }
        const activeNodes = activeNodesResult.value;
        const node = utils.getRandom(activeNodes.nodeList, 1)[0];
        await http.post(`${node.ip}:${node.port}/unjoin`, unjoinRequest);
        return ok(void 0);
    }
    catch (e) {
        throw new Error(`submitUnjoin: Error posting unjoin request: ${e}`);
    }
}
export function processNewUnjoinRequest(unjoinRequest: SignedUnjoinRequest): Result<void, Error> {
    return validateUnjoinRequest(unjoinRequest).map(() => {
        newUnjoinRequests.add(unjoinRequest);
    });
}
export function validateUnjoinRequest(unjoinRequest: SignedUnjoinRequest): Result<void, Error> {
    const newUnjoinRequestsArray = Array.from(newUnjoinRequests);
    if (newUnjoinRequestsArray.some((req) => req.publicKey === unjoinRequest.publicKey)) {
        return err(new Error(`unjoin request from ${unjoinRequest.publicKey} already exists`));
    }
    const cycleNumber = CycleChain.getNewest().counter;
    if (Math.abs(cycleNumber - unjoinRequest.cycleNumber) > 1) {
        return err(new Error(`cycle number in SignedUnjoinRequest request is not close enough to the current cycle`));
    }
    const wasSelectedLastCycle = CycleChain.newest.joinedConsensors.find((node) => node.publicKey === unjoinRequest.publicKey)
        ? true
        : false;
    const foundInActiveNodes = NodeList.byPubKey.has(unjoinRequest.publicKey);
    if (foundInActiveNodes && wasSelectedLastCycle === false) {
        return err(new Error(`unjoin request from ${unjoinRequest.publicKey} is from an active node that can't unjoin`));
    }
    const foundInStandbyNodes = getStandbyNodesInfoMap().has(unjoinRequest.publicKey);
    if (!foundInStandbyNodes && wasSelectedLastCycle === false) {
        return err(new Error(`unjoin request from ${unjoinRequest.publicKey} is from a node not in standby (doesn't exist?)`));
    }
    if (!crypto.verify(unjoinRequest, unjoinRequest.publicKey)) {
        return err(new Error('unjoin request signature is invalid'));
    }
    return ok(void 0);
}
export function drainNewUnjoinRequests(): SignedUnjoinRequest[] {
    const drained = [...newUnjoinRequests.values()];
    newUnjoinRequests.clear();
    return drained;
}
export function deleteStandbyNode(publicKey: hexstring): void {
    if (deleteStandbyNodeFromMap(publicKey)) {
    }
    else {
    }
}
export function removeUnjoinRequest(publicKey: hexstring): void {
    newUnjoinRequests.forEach((unjoinRequest) => {
        if (unjoinRequest.publicKey === publicKey) {
            newUnjoinRequests.delete(unjoinRequest);
        }
    });
}