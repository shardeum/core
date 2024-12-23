import { parse as parseUrl } from 'url';
import got from 'got';
import { logFlags } from '../logger';
import { Utils } from '@shardus/types';
import { stringifyReduceLimit } from '../utils';
let _logger = null;
let getIndex = 1;
let postIndex = -1;
const httpResLogLength = 5000;
function _containsProtocol(url: string) {
    if (!url.match('https?://*'))
        return false;
    return true;
}
function _normalizeUrl(url: string) {
    let normalized = url;
    if (!_containsProtocol(url))
        normalized = 'http://' + url;
    return normalized;
}
async function _get(host, logIndex, timeout = 1000) {
    try {
        const res = await got.get(host.href, {
            timeout: timeout,
            retry: 0,
            headers: {
                'Accept': 'application/json',
            }
        });
        let responseBody = res.body;
        if (typeof responseBody === 'string' && res.headers['content-type']?.includes('application/json')) {
            try {
                responseBody = Utils.safeJsonParse(responseBody);
            }
            catch (parseError) {
                console.error('Failed to parse JSON response:', parseError);
            }
        }
        return { ...res, body: responseBody as any };
    }
    catch (error) {
        if (logFlags.playback === false && logFlags.verbose === false) {
            throw error;
        }
        logError('post', error, host, logIndex);
    }
}
async function get<T>(url: string, getResponseObj = false, timeout = 1000): Promise<T> {
    let normalized = _normalizeUrl(url);
    let host = parseUrl(normalized, true);
    getIndex++;
    const localIndex = getIndex;
    if (_logger) {
    }
    let res = await _get(host, localIndex, timeout);
    if (_logger) {
    }
    if (getResponseObj) {
        return res;
    }
    return res.body;
}
async function _post(host, payload, logIndex, timeout = 1000) {
    try {
        const res = await got.post(host.href, {
            timeout: timeout,
            retry: 0,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: Utils.safeStringify(payload),
        });
        let responseBody = res.body;
        if (typeof responseBody === 'string' && res.headers['content-type']?.includes('application/json')) {
            try {
                responseBody = Utils.safeJsonParse(responseBody);
            }
            catch (parseError) {
                console.error('Failed to parse JSON response:', parseError);
            }
        }
        return { ...res, body: responseBody };
    }
    catch (error) {
        if (logFlags.playback === false && logFlags.verbose === false) {
            throw error;
        }
        logError('post', error, host, logIndex);
    }
}
async function post(givenHost, body, getResponseObj = false, timeout = 1000) {
    let normalized = _normalizeUrl(givenHost);
    let host = parseUrl(normalized, true);
    postIndex--;
    const localIndex = postIndex;
    if (_logger) {
    }
    let res = await _post(host, body, localIndex, timeout);
    if (_logger) {
    }
    if (getResponseObj)
        return res;
    return res.body as any;
}
function logError(method: string, error: any, host: any, logIndex: any) {
    if (error.code === 'ETIMEDOUT') {
        if (logFlags.verbose)
            console.error(`${method}: HTTP request timed out:`, error);
        if (_logger) {
        }
        throw error;
    }
    else if (error.response && error.response.statusCode === 400) {
        if (logFlags.verbose)
            console.error(`${method}: Bad Request:`, error.message, ' ', error);
        if (_logger) {
        }
        throw error;
    }
    else {
        if (logFlags.verbose)
            console.error(`${method}: An unexpected error occurred:`, error);
        if (_logger) {
        }
        throw error;
    }
}
function buildGotErrorDescription(error) {
    let description = 'Got error: ';
    if (error.code) {
        description += `[Code: ${error.code}] `;
    }
    if (error.response && error.response.statusCode) {
        description += `[Status Code: ${error.response.statusCode}] `;
    }
    if (error.message) {
        description += error.message;
    }
    return description;
}
function setLogger(logger) {
    _logger = logger;
}
export { get, post, setLogger };