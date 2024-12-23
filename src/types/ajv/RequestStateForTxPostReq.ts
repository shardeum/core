import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaRequestStateForTxPostReq = {
    type: 'object',
    properties: {
        txid: { type: 'string' },
        timestamp: { type: 'number' },
        key: { type: 'string' },
        hash: { type: 'string' },
    },
    required: ['txid', 'timestamp', 'key', 'hash'],
};
export function initRequestStateForTxPostReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.RequestStateForTxPostReq, schemaRequestStateForTxPostReq);
}