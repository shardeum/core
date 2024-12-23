import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaGetTrieAccountHashesReq = {
    type: 'object',
    properties: {
        radixList: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    required: ['radixList'],
};
export function initGetTrieAccountHashesReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetTrieAccountHashesReq, schemaGetTrieAccountHashesReq);
}