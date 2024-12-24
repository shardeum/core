import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
export const schemaSignAppDataReq = {
    type: 'object',
    properties: {
        type: { type: 'string' },
        nodesToSign: { type: 'number' },
        hash: { type: 'string' },
        appData: {},
    },
    required: ['type', 'nodesToSign', 'hash', 'appData'],
};
export function initSignAppDataReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.SignAppDataReq, schemaSignAppDataReq);
}