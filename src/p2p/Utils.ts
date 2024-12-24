import * as crypto from 'crypto';
import util from 'util';
import { logFlags } from '../logger';
import * as utils from '../utils';
import { getRandom, sleep, stringifyReduce } from '../utils';
import FastRandomIterator from '../utils/FastRandomIterator';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { profilerInstance } from '../utils/profiler';
import { config, stateManager } from './Context';
import * as Context from './Context';
import * as Self from './Self';
import * as NodeList from './NodeList';
import { Logger } from 'log4js';
import { P2P } from '@shardus/types';
import { Result } from 'neverthrow';
import { getPublicNodeInfo } from './Self';
import * as http from '../http';
import { ok, err } from 'neverthrow';
import { postToArchiver, getNumArchivers, getRandomArchiver } from './Archivers';
import { JoinedArchiver } from '@shardus/types/build/src/p2p/ArchiversTypes';
import { ActiveNode } from '@shardus/types/build/src/p2p/SyncTypes';
export type QueryFunction<Node, Response> = (node: Node) => PromiseLike<Response>;
export type VerifyFunction<Result> = (result: Result) => boolean;
export type EqualityFunction<Value> = (val1: Value, val2: Value) => boolean;
export type CompareFunction<Result> = (result: Result) => Comparison;
export enum Comparison {
    BETTER,
    EQUAL,
    WORSE,
    ABORT
}
export interface CompareQueryError<Node> {
    node: Node;
    error: string;
}
export type CompareFunctionResult<Node> = Array<CompareQueryError<Node>>;
export interface SequentialQueryError<Node> {
    node: Node;
    error: Error;
    response?: unknown;
}
export interface SequentialQueryResult<Node> {
    result: unknown;
    errors: Array<SequentialQueryError<Node>>;
}
export type SeedNodesList = {
    nodeList: P2P.P2PTypes.Node[];
    joinRequest: P2P.ArchiversTypes.Request | undefined;
    restartCycleRecord: P2P.ArchiversTypes.RestartCycleRecord | undefined;
    dataRequestCycle: unknown;
    dataRequestStateMetaData: unknown;
};
export async function compareQuery<Node = unknown, Response = unknown>(nodes: Node[], queryFn: QueryFunction<Node, Response>, compareFn: CompareFunction<Response>, matches: number): Promise<CompareFunctionResult<Node>> {
    let abort: boolean;
    let startOver: boolean;
    let errors: Array<CompareQueryError<Node>>;
    let matched: number;
    do {
        abort = false;
        startOver = false;
        errors = [];
        matched = 0;
        for (const node of nodes) {
            try {
                const response = await queryFn(node);
                switch (compareFn(response)) {
                    case Comparison.BETTER:
                        startOver = true;
                        break;
                    case Comparison.EQUAL:
                        matched++;
                        if (matched >= matches)
                            return errors;
                        break;
                    case Comparison.WORSE:
                        break;
                    case Comparison.ABORT:
                        abort = true;
                        break;
                    default:
                }
                if (abort)
                    break;
                if (startOver)
                    break;
            }
            catch (error) {
                errors.push({
                    node,
                    error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
                });
            }
        }
    } while (startOver);
    return errors;
}
export async function sequentialQuery<Node = unknown, Response = unknown>(nodes: Node[], queryFn: QueryFunction<Node, Response>, verifyFn: VerifyFunction<Response> = () => true): Promise<SequentialQueryResult<Node>> {
    nodes = [...nodes];
    utils.shuffleArray(nodes);
    let result: Response;
    const errors: Array<SequentialQueryError<Node>> = [];
    for (const node of nodes) {
        try {
            const response = await queryFn(node);
            if (verifyFn(response) === false) {
                errors.push({
                    node,
                    error: new Error('Response failed verifyFn'),
                    response,
                });
                continue;
            }
            result = response;
        }
        catch (error) {
            errors.push({
                node,
                error,
            });
        }
    }
    return {
        result,
        errors,
    };
}
type TallyItem<N, T> = {
    value: T;
    count: number;
    nodes: N[];
};
export type RobustQueryResult<N, R> = {
    topResult: R;
    winningNodes: N[];
    isRobustResult: boolean;
};
class Tally<Node, Response> {
    winCount: number;
    equalFn: EqualityFunction<Response>;
    items: TallyItem<Node, Response>[];
    extraDebugging: boolean;
    constructor(winCount: number, equalFn: EqualityFunction<Response>, extraDebugging = false) {
        this.winCount = winCount;
        this.equalFn = equalFn;
        this.items = [];
        this.extraDebugging = extraDebugging;
    }
    add(response: Response, node: Node): TallyItem<Node, Response> | null {
        if (response === null) {
            return null;
        }
        for (const item of this.items) {
            if (!this.equalFn(response, item.value))
                continue;
            item.count++;
            item.nodes.push(node);
            if (item.count >= this.winCount) {
                return item;
            }
            return null;
        }
        const newItem = { value: response, count: 1, nodes: [node] };
        this.items.push(newItem);
        if (this.winCount === 1)
            return newItem;
    }
    getHighestCount() {
        if (!this.items.length)
            return 0;
        let highestCount = 0;
        for (const item of this.items) {
            if (item.count > highestCount) {
                highestCount = item.count;
            }
        }
        return highestCount;
    }
    getHighestCountItem(): TallyItem<Node, Response> | null {
        if (!this.items.length)
            return null;
        let highestCount = 0;
        let highestIndex = 0;
        let i = 0;
        for (const item of this.items) {
            if (item.count > highestCount) {
                highestCount = item.count;
                highestIndex = i;
            }
            i += 1;
        }
        return this.items[highestIndex];
    }
}
export async function robustQuery<Node = unknown, Response = unknown>(nodes: Node[] = [], queryFn: QueryFunction<Node, Response>, equalityFn: EqualityFunction<Response> = util.isDeepStrictEqual, redundancy = 3, shuffleNodes = true, strictRedundancy = false, extraDebugging = false, note = 'general', maxRetry = 20): Promise<RobustQueryResult<Node, Response>> {
    if (nodes.length === 0)
        throw new Error('No nodes given.');
    if (typeof queryFn !== 'function') {
        throw new Error(`Provided queryFn ${queryFn} is not a valid function.`);
    }
    if (redundancy < 1) {
        redundancy = 3;
    }
    if (redundancy > nodes.length) {
        if (strictRedundancy) {
            return { topResult: null, winningNodes: [], isRobustResult: false };
        }
        redundancy = nodes.length;
    }
    const responses = new Tally<Node, Response>(redundancy, equalityFn);
    let errors = 0;
    let randomNodeIterator: FastRandomIterator = null;
    if (shuffleNodes === true) {
        randomNodeIterator = new FastRandomIterator(nodes.length, redundancy);
    }
    else {
        nodes = [...nodes];
    }
    const nodeCount = nodes.length;
    const queryNodes = async (nodes: Node[]): Promise<TallyItem<Node, Response> | null> => {
        const wrappedQuery = async (node: Node) => {
            const response = await queryFn(node);
            return { response, node };
        };
        const queries = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            queries.push(wrappedQuery(node));
        }
        const [results, errs] = await utils.robustPromiseAll<{
            response: Response;
            node: Node;
        }>(queries);
        if (logFlags.console || config.debug.robustQueryDebug || extraDebugging) {
        }
        let finalResult: TallyItem<Node, Response>;
        for (const result of results) {
            const { response, node } = result;
            if (response === null) {
                continue;
            }
            finalResult = responses.add(response, node);
            if (finalResult) {
                break;
            }
        }
        if (extraDebugging) {
        }
        for (const err of errs) {
            errors += 1;
        }
        if (!finalResult) {
            return null;
        }
        return finalResult;
    };
    let finalResult: TallyItem<Node, Response> = null;
    let tries = 0;
    while (!finalResult) {
        tries += 1;
        const toQuery = redundancy - responses.getHighestCount();
        if (nodes.length < toQuery) {
            break;
        }
        let nodesToQuery: Node[];
        if (shuffleNodes) {
            let index = randomNodeIterator.getNextIndex();
            nodesToQuery = [];
            while (index >= 0 && nodesToQuery.length < toQuery) {
                nodesToQuery.push(nodes[index]);
                index = randomNodeIterator.getNextIndex();
            }
        }
        else {
            nodesToQuery = nodes.splice(0, toQuery);
        }
        finalResult = await queryNodes(nodesToQuery);
        if (tries >= maxRetry) {
            break;
        }
    }
    if (finalResult) {
        const isRobustResult = finalResult.count >= redundancy;
        return {
            topResult: finalResult.value,
            winningNodes: finalResult.nodes,
            isRobustResult,
        };
    }
    else {
        const highestCountItem = responses.getHighestCountItem();
        if (highestCountItem === null) {
            if (config.debug.robustQueryDebug || extraDebugging) {
            }
            return { topResult: null, winningNodes: [], isRobustResult: false };
        }
        const isRobustResult = highestCountItem.count >= redundancy;
        if (config.debug.robustQueryDebug || extraDebugging) {
        }
        return {
            topResult: highestCountItem.value,
            winningNodes: highestCountItem.nodes,
            isRobustResult,
        };
    }
}
export async function attempt<T>(fn: () => Promise<T>, options?: AttemptOptions): Promise<T> {
    const maxRetries = options?.maxRetries || 3;
    const delay = options?.delay || 2000;
    const logPrefix = options?.logPrefix || 'attempt';
    const logger = options?.logger;
    let lastError = new Error('out of retries');
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        }
        catch (e) {
            if (logger && logFlags.error)
                logger.error(`${logPrefix}: attempt failure #${i + 1}: ${e.message}`);
            lastError = e;
            await sleep(delay);
            continue;
        }
    }
    if (logger && logFlags.error)
        logger.error(`${logPrefix}: giving up`);
    throw lastError;
}
export interface AttemptOptions {
    maxRetries?: number;
    delay?: number;
    logPrefix?: string;
    logger?: Logger;
    timeout?: number;
}
export function generateUUID(): string {
    const buffer = crypto.randomBytes(16);
    buffer[6] = (buffer[6] & 0x0f) | 0x40;
    buffer[8] = (buffer[8] & 0x3f) | 0x80;
    const uuid = buffer.toString('hex');
    return `${uuid.substring(0, 8)}-${uuid.substring(8, 4)}-${uuid.substring(12, 4)}-${uuid.substring(16, 4)}-${uuid.substring(20)}`;
}
export function getOurNodeIndex(): number | null {
    let nodeInfo = stateManager.currentCycleShardData.nodeShardDataMap.get(Self.id);
    if (!nodeInfo)
        return null;
    return nodeInfo.ourNodeIndex;
}
export const getOurNodeIndexFromSyncingList = (): number | null => {
    let nodeIndex = NodeList.syncingByIdOrder.findIndex((node) => node.id === Self.id);
    if (nodeIndex === -1)
        return null;
    return nodeIndex;
};
export function getRandomAvailableArchiver(): P2P.SyncTypes.ActiveNode {
    if (getNumArchivers() === 0) {
        const availableArchivers = Context.config.p2p.existingArchivers;
        return getRandom(availableArchivers, 1)[0];
    }
    return getRandomArchiver();
}
export async function getActiveNodesFromArchiver(archiver: ActiveNode): Promise<Result<P2P.P2PTypes.SignedObject<SeedNodesList>, Error>> {
    const nodeInfo = getPublicNodeInfo();
    return postToArchiver<unknown, P2P.P2PTypes.SignedObject<SeedNodesList>>(archiver, 'nodelist', Context.crypto.sign({
        nodeInfo,
    }), 10000).mapErr((e) => {
        const nodeListUrl = `http://${archiver.ip}:${archiver.port}/nodelist`;
        return Error(`Could not get seed list from seed node server 2 ${nodeListUrl}: ` + e.message);
    });
}
function isNodeRecentlyRotatedIn(idx: number, numActiveNodes: number): boolean {
    return (numActiveNodes >= 10 + config.p2p.rotationEdgeToAvoid &&
        config.p2p.rotationEdgeToAvoid &&
        idx <= config.p2p.rotationEdgeToAvoid);
}
function isNodeNearRotatingOut(idx: number, numActiveNodes: number): boolean {
    return (numActiveNodes >= 10 + config.p2p.rotationEdgeToAvoid &&
        config.p2p.rotationEdgeToAvoid &&
        idx >= numActiveNodes - config.p2p.rotationEdgeToAvoid);
}
export function isNodeInRotationBounds(nodeId: string): boolean {
    const { idx, total } = NodeList.getAgeIndexForNodeId(nodeId);
    if (isNodeRecentlyRotatedIn(idx, total)) {
        return true;
    }
    if (isNodeNearRotatingOut(idx, total)) {
        return true;
    }
    return false;
}