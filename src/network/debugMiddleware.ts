import { isDebugMode, getDevPublicKeys, ensureKeySecurity, getMultisigPublicKeys } from '../debug';
import * as Context from '../p2p/Context';
import * as crypto from '@shardus/crypto-utils';
import { DevSecurityLevel } from '../shardus/shardus-types';
import SERVER_CONFIG from '../config/server';
import { logFlags } from '../logger';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { Utils } from '@shardus/types';
import { SignedObject } from '@shardus/crypto-utils';
import * as CycleChain from '../p2p/CycleChain';
import { contactArchiver, getStatusHistoryCopy } from '../p2p/Self';
import { NodeStatus } from '@shardus/types/build/src/p2p/P2PTypes';
import { getNewestCycle } from '../p2p/Sync';
const MAX_COUNTER_BUFFER_MILLISECONDS = 10000;
let lastCounter = Date.now();
let multiSigLstCounter = Date.now();
async function handleDebugAuth(_req, res, next, authLevel) {
    try {
        let statusHist = getStatusHistoryCopy();
        let statusNow = statusHist[statusHist.length - 1].moduleStatus || undefined;
        let weAreActive = statusNow === NodeStatus.ACTIVE;
        let latestCycle = CycleChain.newest;
        if (!weAreActive) {
            const activeNodes = await contactArchiver("dbgMiddleware");
            latestCycle = await getNewestCycle(activeNodes);
        }
        if (!latestCycle) {
            res.status(500).json({ error: "Node can't gather latest Cycle to perform signature verification" });
        }
        if (_req.query.sig != null && _req.query.sig_counter != null) {
            const nodes = String(_req.query.nodePubkeys).split(',');
            const ourPubkey = Context.crypto.getPublicKey().slice(0, 4);
            let intentedForOurNode = false;
            nodes.forEach((id) => {
                if (ourPubkey === id) {
                    intentedForOurNode = true;
                }
            });
            if (!intentedForOurNode) {
                return res.status(401).json({
                    status: 401,
                    message: 'Unauthorized!',
                });
            }
            let payload = {
                route: stripQueryParams(_req.originalUrl, ['sig', 'sig_counter', 'nodePubkeys']),
                count: _req.query.sig_counter,
                nodes: _req.query.nodePubkeys,
                networkId: latestCycle.networkId,
                cycleCounter: latestCycle.counter,
            };
            const hash = crypto.hash(Utils.safeStringify(payload));
            const devPublicKeys = getDevPublicKeys();
            const requestSig = _req.query.sig;
            for (const ownerPk in devPublicKeys) {
                const sign = { owner: ownerPk, sig: requestSig };
                const hashIncluded = {
                    route: payload.route,
                    count: payload.count,
                    nodes: payload.nodes,
                    networkId: payload.networkId,
                    cycleCounter: payload.cycleCounter,
                    requestHash: hash,
                    sign,
                } as SignedObject;
                const currentCounter = parseInt(payload.count);
                const currentTime = Date.now();
                if (currentCounter > lastCounter && currentCounter <= currentTime + MAX_COUNTER_BUFFER_MILLISECONDS) {
                    let verified = Context.crypto.verify(hashIncluded, hashIncluded.sign.owner);
                    if (verified === true) {
                        const authorized = ensureKeySecurity(ownerPk, authLevel);
                        if (authorized) {
                            lastCounter = currentCounter;
                            next();
                            return;
                        }
                        else {
                            return res.status(403).json({
                                status: 403,
                                message: 'FORBIDDEN!',
                            });
                        }
                    }
                    else {
                    }
                }
                else {
                    if (logFlags.verbose) {
                        const parsedCounter = parseInt(hashIncluded.count);
                        if (Number.isNaN(parsedCounter)) {
                        }
                        else {
                        }
                    }
                }
            }
        }
    }
    catch (error) {
    }
    return res.status(401).json({
        status: 401,
        message: 'Unauthorized!',
    });
}
async function handleDebugMultiSigAuth(_req, res, next, authLevel: DevSecurityLevel) {
    try {
        let statusHist = getStatusHistoryCopy();
        let statusNow = statusHist[statusHist.length - 1].moduleStatus || undefined;
        let weAreActive = statusNow === NodeStatus.ACTIVE;
        let latestCycle = CycleChain.newest;
        if (!weAreActive) {
            const activeNodes = await contactArchiver("dbgMiddleware");
            latestCycle = await getNewestCycle(activeNodes);
        }
        if (!latestCycle) {
            res.status(500).json({ error: "Node can't gather latest Cycle to perform signature verification" });
        }
        if (_req.query.sig != null && _req.query.sig_counter != null) {
            const devPublicKeys = getMultisigPublicKeys();
            let parsedSignatures = Utils.safeJsonParse(_req.query.sig);
            if (!parsedSignatures || Array.isArray(parsedSignatures) === false) {
                return res.status(400).json({
                    status: 400,
                    message: 'Bad Request!',
                });
            }
            const nodes = String(_req.query.nodePubkeys).split(',');
            const ourPubkey = Context.crypto.getPublicKey().slice(0, 4);
            let intentedForOurNode = false;
            nodes.forEach((id) => {
                if (ourPubkey === id) {
                    intentedForOurNode = true;
                }
            });
            if (!intentedForOurNode) {
                return res.status(401).json({
                    status: 401,
                    message: 'Unauthorized!',
                });
            }
            if (parsedSignatures.length > devPublicKeys.length) {
                return res.status(400).json({
                    status: 400,
                    message: 'Bad Request! Too many signatures.',
                });
            }
            parsedSignatures = Array.from(new Set(parsedSignatures));
            const minApprovals = Math.max(1, SERVER_CONFIG.debug.minMultiSigRequiredForEndpoints);
            if (parsedSignatures.length < minApprovals) {
                return res.status(400).json({
                    status: 400,
                    message: 'Bad Request! Not enough signatures.',
                });
            }
            const payload: any = {
                route: stripQueryParams(_req.originalUrl, ['sig', 'sig_counter', 'nodePubkeys']),
                nodes: _req.query.nodePubkeys,
                count: _req.query.sig_counter,
                networkId: latestCycle.networkId,
            };
            if (parseInt(_req.query.sig_counter) > multiSigLstCounter && parsedSignatures.length >= minApprovals) {
                const signaturesValid = Context.stateManager.app.verifyMultiSigs(payload, parsedSignatures, devPublicKeys, minApprovals, authLevel);
                if (signaturesValid) {
                    multiSigLstCounter = parseInt(_req.query.sig_counter);
                    next();
                    return;
                }
                else {
                    return res.status(401).json({
                        status: 401,
                        message: 'Unauthorized! Invalid signatures.',
                    });
                }
            }
            else {
            }
        }
    }
    catch (error) {
    }
    return res.status(403).json({
        status: 403,
        message: 'FORBIDDEN. Endpoint is only available in debug mode in addtion to signature verification.',
    });
}
function stripQueryParams(url: string, params: string[]) {
    let [base, ...tail] = url.split('?');
    let queryString = tail.join('?');
    if (!queryString)
        return url;
    let queryParams = queryString.split('&');
    queryParams = queryParams.filter((param) => {
        let [key, value] = param.split('=');
        return !params.includes(key);
    });
    queryString = queryParams.join('&');
    if (queryString === '')
        return base;
    return `${base}?${queryString}`;
}
export const isDebugModeMiddleware = (_req, res, next) => {
    isDebugModeMiddlewareHigh(_req, res, next);
};
export const isDebugModeMiddlewareLow = (_req, res, next) => {
    const isDebug = isDebugMode();
    if (!isDebug) {
        handleDebugAuth(_req, res, next, DevSecurityLevel.Low);
    }
    else
        next();
};
export const isDebugModeMiddlewareMedium = (_req, res, next) => {
    const isDebug = isDebugMode();
    if (!isDebug) {
        handleDebugAuth(_req, res, next, DevSecurityLevel.Medium);
    }
    else
        next();
};
export const isDebugModeMiddlewareHigh = (_req, res, next) => {
    const isDebug = isDebugMode();
    if (!isDebug) {
        handleDebugAuth(_req, res, next, DevSecurityLevel.High);
    }
    else
        next();
};
export const isDebugModeMiddlewareMultiSig = (_req, res, next) => {
    const isDebug = isDebugMode();
    if (!isDebug) {
        handleDebugMultiSigAuth(_req, res, next, DevSecurityLevel.High);
    }
    else
        next();
};
export const isDebugModeMiddlewareMultiSigHigh = (_req, res, next) => {
    const isDebug = isDebugMode();
    if (!isDebug) {
        handleDebugMultiSigAuth(_req, res, next, DevSecurityLevel.High);
    }
    else
        next();
};
export const isDebugModeMiddlewareMultiSigMedium = (_req, res, next) => {
    const isDebug = isDebugMode();
    if (!isDebug) {
        handleDebugMultiSigAuth(_req, res, next, DevSecurityLevel.Medium);
    }
    else
        next();
};
export const isDebugModeMiddlewareMultiSigLow = (_req, res, next) => {
    const isDebug = isDebugMode();
    if (!isDebug) {
        handleDebugMultiSigAuth(_req, res, next, DevSecurityLevel.Low);
    }
    else
        next();
};