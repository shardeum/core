import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
export const schemaSignAppDataResp = {
    type: 'object',
    properties: {
        success: { type: 'boolean' },
        signature: {
            type: 'object',
            properties: {
                owner: { type: 'string' },
                sig: { type: 'string' },
            },
            required: ['owner', 'sig'],
        },
    },
    required: ['success', 'signature'],
};
export function initSignAppDataResp(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.SignAppDataResp, schemaSignAppDataResp);
}