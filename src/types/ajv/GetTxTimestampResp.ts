import { addSchema } from '../../utils/serialization/SchemaHelpers';
const schemaGetTxTimestampResp = {
    type: 'object',
    properties: {
        txId: { type: 'string' },
        cycleCounter: { type: 'number' },
        cycleMarker: { type: 'string' },
        timestamp: { type: 'number' },
        sign: {
            type: 'object',
            properties: {
                owner: { type: 'string' },
                sig: { type: 'string' },
            },
        },
        isResponse: { type: 'boolean' },
    },
    required: ['txId', 'cycleCounter', 'cycleMarker', 'timestamp'],
};
export function initGetTxTimestampResp(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema('GetTxTimestampResp', schemaGetTxTimestampResp);
}