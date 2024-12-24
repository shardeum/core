import { addSchema } from '../../utils/serialization/SchemaHelpers';
const schemaAccountIDAndHash = {
    type: 'object',
    properties: {
        accountID: { type: 'string' },
        hash: { type: 'string' },
    },
    required: ['accountID', 'hash'],
};
const schemaGetAccountDataByHashesReq = {
    type: 'object',
    properties: {
        cycle: { type: 'number' },
        accounts: {
            type: 'array',
            items: schemaAccountIDAndHash,
        },
    },
    required: ['cycle', 'accounts'],
};
export function initGetAccountDataByHashesReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema('GetAccountDataByHashesReq', schemaGetAccountDataByHashesReq);
}