import { P2P } from '@shardus/types';
import { Handler } from 'express';
import * as CycleChain from '../CycleChain';
import { network } from '../Context';
import * as NodeList from '../NodeList';
import * as Archivers from '../Archivers';
import * as CycleCreator from '../CycleCreator';
import * as JoinV2 from '../Join/v2';
import * as ServiceQueue from '../ServiceQueue';
import { profilerInstance } from '../../utils/profiler';
import { logFlags } from '../../logger';
import { jsonHttpResWithSize } from '../../utils';
import { Utils } from '@shardus/types';
const validatorListHashRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'validator-list-hash',
    handler: (_req, res) => {
        const nextCycleTimestamp = CycleCreator.nextQ1Start;
        res.json({ nodeListHash: NodeList.getNodeListHash(), nextCycleTimestamp });
    },
};
const archiverListHashRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'archiver-list-hash',
    handler: (_req, res) => {
        res.json({ archiverListHash: Archivers.getArchiverListHash() });
    },
};
const standbyListHashRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'standby-list-hash',
    handler: (_req, res) => {
        res.json({ standbyNodeListHash: JoinV2.getStandbyListHash() });
    },
};
const txListHashRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'tx-list-hash',
    handler: (_req, res) => {
        res.send({ txListHash: ServiceQueue.getTxListHash() });
    },
};
const newestCycleHashRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'current-cycle-hash',
    handler: (_req, res) => {
        res.json({ currentCycleHash: CycleChain.getCurrentCycleMarker() });
    },
};
const validatorListRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'validator-list',
    handler: (req, res) => {
        let respondSize = 0;
        try {
            const expectedHash = req.query.hash;
            if (expectedHash && expectedHash === NodeList.getNodeListHash()) {
                const getLastHashedNodeList = NodeList.getLastHashedNodeList();
                respondSize = jsonHttpResWithSize(res, getLastHashedNodeList);
            }
            else {
                if (logFlags.debug)
                    console.error(`rejecting validator list request: expected '${expectedHash}' != '${NodeList.getNodeListHash()}'`);
                res.status(404).json({ error: `validator list with hash '${expectedHash}' not found` });
            }
        }
        finally {
        }
    },
};
const archiverListRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'archiver-list',
    handler: (req, res) => {
        const expectedHash = req.query.hash;
        if (expectedHash && expectedHash === Archivers.getArchiverListHash()) {
            res.json(Archivers.getLastHashedArchiverList());
        }
        else {
            if (logFlags.debug)
                console.error(`rejecting archiver list request: expected '${expectedHash}' != '${Archivers.getArchiverListHash()}'`);
            res.status(404).json({ error: `archiver list with hash '${expectedHash}' not found` });
        }
    },
};
const standbyListRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'standby-list',
    handler: (req, res) => {
        let respondSize = 0;
        try {
            const expectedHash = req.query.hash;
            if (expectedHash && expectedHash === JoinV2.getStandbyListHash()) {
                const standbyList = JoinV2.getLastHashedStandbyList();
                respondSize = jsonHttpResWithSize(res, standbyList);
            }
            else {
                if (logFlags.debug)
                    console.error(`rejecting standby list request: expected '${expectedHash}' != '${JoinV2.getStandbyListHash()}'`);
                res.status(404).json({ error: `standby list with hash '${expectedHash}' not found` });
            }
        }
        finally {
        }
    },
};
const txListRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'tx-list',
    handler: (req, res) => {
        try {
            const expectedHash = req.query.hash;
            if (expectedHash && expectedHash === ServiceQueue.getTxListHash()) {
                const txList = ServiceQueue.getTxList();
                res.json(txList);
            }
            else {
                if (logFlags.debug)
                    console.error(`rejecting tx list request: expected '${expectedHash}' != '${ServiceQueue.getTxListHash()}'`);
                res.status(404).send(`tx list with hash '${expectedHash}' not found`);
            }
        }
        finally {
        }
    },
};
const cycleByMarkerRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'cycle-by-marker',
    handler: (req, res) => {
        const cycle = CycleChain.cyclesByMarker[req.query.marker as string];
        if (cycle) {
            res.json(cycle);
        }
        else {
            res.status(404).json({ error: `cycle with marker '${req.query.marker}' not found` });
        }
    },
};
const newestCycleRecordRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'newest-cycle-record',
    handler: (_req, res) => {
        res.json(CycleChain.newest);
    },
};
export function initRoutes(): void {
    const routes = [
        validatorListHashRoute,
        archiverListHashRoute,
        standbyListHashRoute,
        txListHashRoute,
        newestCycleHashRoute,
        validatorListRoute,
        archiverListRoute,
        standbyListRoute,
        txListRoute,
        cycleByMarkerRoute,
        newestCycleRecordRoute,
    ];
    for (const route of routes) {
        network._registerExternal(route.method, route.name, route.handler);
    }
}