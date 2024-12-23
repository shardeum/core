import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaSyncTrieHashesReq = {
    type: 'object',
    properties: {
        cycle: { type: 'number' },
        nodeHashes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    radix: { type: 'string' },
                    hash: { type: 'string' },
                },
                required: ['radix', 'hash'],
            },
        },
    },
    required: ['cycle', 'nodeHashes'],
};
export function initSyncTrieHashesReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.SyncTrieHashesReq, schemaSyncTrieHashesReq);
}