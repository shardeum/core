import { crypto, shardus } from '../../Context';
import * as Self from '../../Self';
import * as CycleChain from '../../CycleChain';
import * as NodeList from '../../NodeList';
import * as http from '../../../http';
import { getStandbyNodesInfoMap } from '.';
import { calculateToAcceptV2 } from '../../ModeSystemFuncs';
import { fastIsPicked, selectIndexesWithOffeset } from '../../../utils';
import { getOurNodeIndex, getOurNodeIndexFromSyncingList } from '../../Utils';
import { nestedCountersInstance } from '../../../utils/nestedCounters';
import { logFlags } from '../../../logger';
const selectedPublicKeys: Set<string> = new Set();
const NUM_NOTIFYING_NODES = 5;
export function executeNodeSelection(): void {
    if (Self.isActive || (!Self.isActive && Self.isRestartNetwork)) {
        const { add } = calculateToAcceptV2(CycleChain.newest);
        selectNodes(add);
    }
    else {
        if (logFlags.p2pNonFatal && logFlags.console)
            console.warn('not selecting nodes because we are not active yet');
        return;
    }
}
export function selectNodes(maxAllowed: number): void {
    const standbyNodesInfo = getStandbyNodesInfoMap();
    const objs: {
        publicKey: string;
        selectionNum: string;
        appJoinData?: Record<string, any> | null;
    }[] = [];
    for (const [publicKey, info] of standbyNodesInfo) {
        objs.push({
            publicKey,
            selectionNum: info.selectionNum,
            appJoinData: info.appJoinData,
        });
    }
    objs.sort((a, b) => (a.selectionNum < b.selectionNum ? 1 : a.selectionNum > b.selectionNum ? -1 : 0));
    let offset = 0;
    const cycleMarker = CycleChain.getCurrentCycleMarker();
    if (cycleMarker) {
        const first8HexChars = cycleMarker.substring(0, 8);
        offset = parseInt(first8HexChars, 16);
    }
    if (maxAllowed > objs.length) {
        maxAllowed = objs.length;
    }
    if (offset >= 0 && maxAllowed >= 1 && maxAllowed <= objs.length) {
        const selectedIndexes = selectIndexesWithOffeset(objs.length, maxAllowed, offset);
        for (let i = 0; i < selectedIndexes.length; i++) {
            const selectedIndex = selectedIndexes[i];
            selectedPublicKeys.add(objs[selectedIndex].publicKey);
        }
    }
    else {
    }
    if (shardus.config.p2p.goldenTicketEnabled === true) {
        for (const obj of objs) {
            if (obj.appJoinData?.adminCert?.goldenTicket === true && !selectedPublicKeys.has(obj.publicKey)) {
                selectedPublicKeys.add(obj.publicKey);
            }
        }
    }
}
export async function notifyNewestJoinedConsensors(): Promise<void> {
    return;
}
export async function notifyingNewestJoinedConsensors(): Promise<void> {
    const marker = CycleChain.getCurrentCycleMarker();
    const counter = CycleChain.getNewest().counter;
    for (const joinedConsensor of CycleChain.newest.joinedConsensors) {
        const publicKey = joinedConsensor.publicKey;
        if (publicKey === crypto.keypair.publicKey)
            continue;
        const offer = crypto.sign({
            cycleMarker: marker,
            activeNodePublicKey: crypto.keypair.publicKey,
        });
        http
            .post(`http://${joinedConsensor.externalIp}:${joinedConsensor.externalPort}/accepted`, offer)
            .catch((e) => {
            console.error(`C${counter} failed to notify node ${publicKey} that it has been selected:`, e);
        });
    }
}
export function drainSelectedPublicKeys(): string[] {
    const tmp = [...selectedPublicKeys.values()];
    selectedPublicKeys.clear();
    return tmp;
}
export function forceSelectSelf(): void {
    selectedPublicKeys.add(crypto.keypair.publicKey);
}