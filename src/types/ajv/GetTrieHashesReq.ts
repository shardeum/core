import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const SchemaGetTrieHashesReq = {
    type: 'object',
    properties: {
        radixList: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    required: ['radixList'],
};
export function initGetTrieHashesReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetTrieHashesReq, SchemaGetTrieHashesReq);
}