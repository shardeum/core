import { hexstring, P2P } from "@shardus/types";
import { err, ok } from "neverthrow";
import { EventEmitter } from "events";
import { Result } from "neverthrow";
import * as http from '../../../http';
import { getRandom } from "../../../utils";
import { crypto } from "../../Context";
import { JoinedConsensor } from "@shardus/types/build/src/p2p/JoinTypes";
import { SignedObject } from "@shardus/types/build/src/p2p/P2PTypes";
import { getActiveNodesFromArchiver, getRandomAvailableArchiver } from "../../Utils";
import * as Self from "../../Self";
let alreadyCheckingAcceptance = false;
let hasConfirmedAcceptance = false;
export interface AcceptanceOffer {
    cycleMarker: hexstring;
    activeNodePublicKey: hexstring;
}
const eventEmitter = new EventEmitter();
export function getEventEmitter(): EventEmitter {
    return eventEmitter;
}
export function reset(): void {
    hasConfirmedAcceptance = false;
}
export function isAlreadyCheckingAcceptance(): boolean {
    return alreadyCheckingAcceptance;
}
export function getHasConfirmedAcceptance(): boolean {
    return hasConfirmedAcceptance;
}
export async function confirmAcceptance(offer: SignedObject<AcceptanceOffer>): Promise<Result<boolean, Error>> {
    let activeNodes: P2P.P2PTypes.Node[];
    alreadyCheckingAcceptance = true;
    try {
        const archiver = getRandomAvailableArchiver();
        const activeNodesResult = await getActiveNodesFromArchiver(archiver);
        if (activeNodesResult.isErr()) {
            return err(new Error(`couldn't get active nodes: ${activeNodesResult.error}`));
        }
        activeNodes = activeNodesResult.value.nodeList;
        if (activeNodes.length === 0) {
            alreadyCheckingAcceptance = false;
            return err(new Error('no active nodes provided'));
        }
        if (!crypto.verify(offer, offer.activeNodePublicKey)) {
            alreadyCheckingAcceptance = false;
            return err(new Error('acceptance offer signature invalid'));
        }
    }
    catch (e) {
        alreadyCheckingAcceptance = false;
        return err(new Error(`error while checking acceptance: ${e}`));
    }
    const randomNode = getRandom(activeNodes, 1)[0];
    let cycle: P2P.CycleCreatorTypes.CycleRecord;
    try {
        cycle = await getCycleFromNode(randomNode, offer.cycleMarker);
    }
    catch (e) {
        alreadyCheckingAcceptance = false;
        return err(new Error(`error getting cycle from node ${randomNode.ip}:${randomNode.port}: ${e}`));
    }
    const ourPublicKey = crypto.getPublicKey();
    const included = cycle.joinedConsensors.some((joinedConsensor: JoinedConsensor) => joinedConsensor.publicKey === ourPublicKey);
    alreadyCheckingAcceptance = false;
    hasConfirmedAcceptance = hasConfirmedAcceptance || included;
    return ok(included);
}
async function getCycleFromNode(node: P2P.P2PTypes.Node, cycleMarker: hexstring): Promise<P2P.CycleCreatorTypes.CycleRecord> {
    const url = `http://${node.ip}:${node.port}/cycle-by-marker?marker=${cycleMarker}`;
    const cycle: P2P.CycleCreatorTypes.CycleRecord = await http.get(url);
    return cycle;
}