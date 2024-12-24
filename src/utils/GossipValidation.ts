import { warn } from 'console';
import { JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { P2P } from '@shardus/types';
import * as NodeList from '../p2p/NodeList';
import * as CycleCreator from '../p2p/CycleCreator';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { logFlags } from '../logger';
import * as utils from '../utils';
import { getStandbyNodesInfoMap } from '../p2p/Join/v2';
import * as CycleChain from '../p2p/CycleChain';
interface GossipPayload {
    nodeId?: string;
    nodeInfo?: P2P.P2PTypes.Node;
    sign?: {
        owner: string;
        sig: string;
    };
    cycleNumber?: number;
}
export function checkGossipPayload<T extends GossipPayload>(payload: T | JoinRequest, validationSchema: Record<string, string>, logContext: string, sender: unknown): boolean {
    if (!payload) {
        if (logFlags.error)
            warn(`${logContext}-reject: missing payload`);
        return false;
    }
    if (![1, 2].includes(CycleCreator.currentQuarter)) {
        if (logFlags.error) {
            warn(`${logContext}-reject: not in Q1 or Q2, currentQuarter: ${CycleCreator.currentQuarter}`);
        }
        return false;
    }
    let signer = null;
    if (logContext === 'gossip-unjoin') {
        const nodeIfSelectedLastCycle = CycleChain.newest.joinedConsensors.find((node) => node.publicKey === payload.sign.owner);
        if (nodeIfSelectedLastCycle) {
            signer = NodeList.byPubKey.get(payload.sign.owner);
            if (!signer) {
                if (logFlags.error)
                    warn(`${logContext}: Got ${logContext} from standby node that was selected to join, but can't find it in NodeList.byPubKey`);
                return false;
            }
        }
        else {
            signer = getStandbyNodesInfoMap().get(payload.sign.owner);
            if (!signer) {
                if (logFlags.error)
                    warn(`${logContext}: Got ${logContext} from unknown standby node`);
                return false;
            }
        }
    }
    else {
        signer = NodeList.byPubKey.get(payload.sign.owner);
        if (!signer) {
            if (logFlags.error)
                warn(`${logContext}: Got ${logContext} from unknown node`);
            return false;
        }
    }
    const isOrig = signer.id === sender;
    if (isOrig && CycleCreator.currentQuarter > 1) {
        return false;
    }
    let err = utils.validateTypes(payload, validationSchema);
    if (err) {
        if (logFlags.error)
            warn(`${logContext}-reject: bad input ${err}`);
        return false;
    }
    if (validationSchema.sign) {
        err = utils.validateTypes(payload.sign, {
            owner: 's',
            sig: 's',
        });
        if (err) {
            if (logFlags.error)
                warn(`${logContext}-reject: bad input sign ${err}`);
            return false;
        }
    }
    else {
        if (logFlags.error)
            warn(`${logContext}-reject: missing sign`);
        return false;
    }
    return true;
}