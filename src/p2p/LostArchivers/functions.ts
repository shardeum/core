import { publicKey } from '@shardus/types';
import { CycleMarker } from '@shardus/types/build/src/p2p/CycleCreatorTypes';
import { ArchiverDownMsg, ArchiverRefutesLostMsg, ArchiverUpMsg, InvestigateArchiverMsg, } from '@shardus/types/build/src/p2p/LostArchiverTypes';
import { Node } from '@shardus/types/build/src/p2p/NodeListTypes';
import { SignedObject } from '@shardus/types/build/src/p2p/P2PTypes';
import * as http from '../../http';
import * as CycleChain from '../../p2p/CycleChain';
import * as Archivers from '../Archivers';
import * as Comms from '../Comms';
import * as Context from '../Context';
import * as NodeList from '../NodeList';
import { LostArchiverRecord, lostArchiversMap } from './state';
import { info, warn, error } from './logging';
import { id } from '../Self';
import { binarySearch } from '../../utils/functions/arrays';
import { activeByIdOrder } from '../NodeList';
import { inspect } from 'util';
import { formatErrorMessage } from '../../utils';
import { nestedCountersInstance } from '../..';
import { shardusGetTime } from '../../network';
import { LostArchiverInvestigateReq, serializeLostArchiverInvestigateReq, } from '../../types/LostArchiverInvestigateReq';
import { InternalRouteEnum } from '../../types/enum/InternalRouteEnum';
import { tellBinary } from '../Comms';
import { Utils } from '@shardus/types';
export function createLostArchiverRecord(obj: Partial<LostArchiverRecord>): LostArchiverRecord {
    if (obj.isInvestigator == null)
        obj.isInvestigator = false;
    if (obj.gossippedDownMsg == null)
        obj.gossippedDownMsg = false;
    if (obj.gossippedUpMsg == null)
        obj.gossippedUpMsg = false;
    if (obj.target == null)
        throw 'Must specify a target for LostArchiverRecord';
    if (obj.status == null)
        obj.status = 'reported';
    if (obj.cyclesToWait == null)
        obj.cyclesToWait = Context.config.p2p.lostArchiversCyclesToWait;
    return obj as LostArchiverRecord;
}
export function reportLostArchiver(publicKey: publicKey, errorMsg: string): void {
    if (Context.config.p2p.enableLostArchiversCycles === false) {
        info(`reportLostArchiver: not enabled, publicKey: ${publicKey}, errorMsg: ${errorMsg}`);
        return;
    }
    info(`reportLostArchiver: publicKey: ${publicKey}, errorMsg: ${errorMsg}`);
    if (lostArchiversMap.has(publicKey)) {
        info('reportLostArchiver: already have LostArchiverRecord');
    }
    else {
        info('reportLostArchiver: adding new LostArchiverRecord');
        lostArchiversMap.set(publicKey, createLostArchiverRecord({
            target: publicKey,
            status: 'reported',
        }));
    }
}
export async function investigateArchiver(investigateMsg: SignedObject<InvestigateArchiverMsg>): Promise<void> {
    info(`investigateArchiver: investigateMsg: ${inspect(investigateMsg)}`);
    const publicKey = investigateMsg.target;
    const archiver = Archivers.archivers.get(publicKey);
    if (!archiver) {
        warn(`investigateArchiver: asked to investigate archiver '${publicKey}', but it's not in the archivers list`);
        return;
    }
    info(`investigateArchiver: publicKey: ${publicKey}`);
    let record = lostArchiversMap.get(publicKey);
    if (record && ['investigating', 'down', 'up'].includes(record.status)) {
        info('investigateArchiver: already have LostArchiverRecord');
        return;
    }
    record = createLostArchiverRecord({
        isInvestigator: true,
        target: publicKey,
        status: 'investigating',
        gossippedDownMsg: false,
        investigateMsg,
    });
    lostArchiversMap.set(publicKey, record);
    const isReachable = await pingArchiver(archiver.ip, archiver.port);
    if (isReachable) {
        info(`investigateArchiver: archiver is reachable`);
        lostArchiversMap.delete(publicKey);
    }
    else {
        info(`investigateArchiver: archiver is not reachable`);
        record.status = 'down';
    }
}
export function getInvestigator(target: publicKey, marker: CycleMarker): Node {
    const obj = { target, marker };
    const near = Context.crypto.hash(obj);
    let idx = binarySearch(activeByIdOrder, near, (i, r) => i.localeCompare(r.id));
    if (idx < 0)
        idx = (-1 - idx) % activeByIdOrder.length;
    const foundNode = activeByIdOrder[idx];
    if (foundNode == null) {
        throw new Error(`activeByIdOrder idx:${idx} length: ${activeByIdOrder.length}`);
    }
    if (foundNode.id === id)
        idx = (idx + 1) % activeByIdOrder.length;
    return foundNode;
}
export function informInvestigator(target: publicKey): void {
    try {
        const cycle = CycleChain.getCurrentCycleMarker();
        const investigator = getInvestigator(target, cycle);
        if (id === investigator.id) {
            info(`informInvestigator: investigator is self, not sending InvestigateArchiverMsg`);
            return;
        }
        const investigateMsg: SignedObject<InvestigateArchiverMsg> = Context.crypto.sign({
            type: 'investigate',
            target,
            investigator: investigator.id,
            sender: id,
            cycle,
        });
        info(`informInvestigator: sending InvestigateArchiverMsg: ${inspect(investigateMsg)}`);
        Comms.tellBinary<LostArchiverInvestigateReq>([investigator], InternalRouteEnum.binary_lost_archiver_investigate, investigateMsg, serializeLostArchiverInvestigateReq, {});
    }
    catch (ex) {
        error('informInvestigator: ' + formatErrorMessage(ex));
    }
}
export function tellNetworkArchiverIsDown(record: LostArchiverRecord): void {
    const archiverKey = record.target;
    info(`tellNetworkArchiverIsDown: archiverKey: ${archiverKey}`);
    const downMsg: SignedObject<ArchiverDownMsg> = Context.crypto.sign({
        type: 'down',
        cycle: CycleChain.getCurrentCycleMarker(),
        investigateMsg: record.investigateMsg,
    });
    info(`tellNetworkArchiverIsDown: downMsg: ${Utils.safeStringify(downMsg)}`);
    record.archiverDownMsg = downMsg;
    Comms.sendGossip('lost-archiver-down', downMsg, '', null, NodeList.byIdOrder, true);
}
export function tellNetworkArchiverIsUp(record: LostArchiverRecord): void {
    const upMsg: SignedObject<ArchiverUpMsg> = Context.crypto.sign({
        type: 'up',
        downMsg: record.archiverDownMsg,
        refuteMsg: record.archiverRefuteMsg,
        cycle: CycleChain.getCurrentCycleMarker(),
    });
    record.archiverUpMsg = upMsg;
    info(`tellNetworkArchiverIsUp: upMsg: ${Utils.safeStringify(upMsg)}`);
    Comms.sendGossip('lost-archiver-up', upMsg, '', null, NodeList.byIdOrder, true);
}
async function pingArchiver(host: string, port: number): Promise<boolean> {
    return (await getArchiverInfo(host, port)) !== null;
}
async function getArchiverInfo(host: string, port: number): Promise<object> | null {
    try {
        return await http.get<object>(`http://${host}:${port}/nodeInfo`);
    }
    catch (e) {
        return null;
    }
}
function missingProperties(obj: object, keys: string | string[]): string[] {
    if (typeof keys === 'string')
        keys = keys.split(/\s+/);
    if (obj == null)
        return keys;
    const missing = [];
    for (const key of keys) {
        if (!(key in obj))
            missing.push(key);
        if (obj[key] === undefined)
            missing.push(key);
    }
    return missing;
}
export function errorForArchiverDownMsg(msg: SignedObject<ArchiverDownMsg> | null): string | null {
    if (msg == null)
        return 'null message';
    if (msg.sign == null)
        return 'no signature';
    const missing = missingProperties(msg, 'type investigateMsg cycle');
    if (missing.length)
        return `missing properties: ${missing.join(', ')}`;
    return _errorForInvestigateArchiverMsg(msg.investigateMsg);
}
export function errorForArchiverUpMsg(msg: SignedObject<ArchiverUpMsg> | null): string | null {
    if (msg == null)
        return 'null message';
    if (msg.sign == null)
        return 'no signature';
    const missing = missingProperties(msg, 'type downMsg refuteMsg cycle');
    if (missing.length)
        return `missing properties: ${missing.join(', ')}`;
    return null;
}
export function errorForArchiverRefutesLostMsg(msg: SignedObject<ArchiverRefutesLostMsg> | null): string | null {
    if (msg == null)
        return 'null message';
    if (msg.sign == null)
        return 'no signature';
    const missing = missingProperties(msg, 'archiver cycle');
    if (missing.length)
        return `missing properties: ${missing.join(', ')}`;
    return null;
}
export function errorForInvestigateArchiverMsg(msg: SignedObject<InvestigateArchiverMsg> | null): string | null {
    if (msg == null)
        return 'null message';
    if (msg.sign == null)
        return 'no signature';
    const error = _errorForInvestigateArchiverMsg(msg);
    if (error)
        return error;
    return null;
}
function _errorForInvestigateArchiverMsg(msg: InvestigateArchiverMsg | null): string | null {
    if (msg == null)
        return 'null message';
    const missing = missingProperties(msg, 'type target investigator sender cycle');
    if (missing.length)
        return `missing properties: ${missing.join(', ')}`;
    if (msg.type !== 'investigate')
        return `invalid type: ${msg.type}`;
    return null;
}