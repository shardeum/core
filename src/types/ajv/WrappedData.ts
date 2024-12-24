import { addSchema } from '../../utils/serialization/SchemaHelpers';
export const schemaWrappedData = {
    type: 'object',
    properties: {
        accountId: { type: 'string' },
        stateId: { type: 'string' },
        data: {},
        timestamp: { type: 'number' },
        syncData: {
            anyOf: [
                { type: 'object', additionalProperties: true },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'array' },
                { type: 'null' },
            ],
        },
    },
    required: ['accountId', 'stateId', 'data', 'timestamp'],
};
export function initWrappedData(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema('WrappedData', schemaWrappedData);
}