import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
export const schemaCachedAppData = {
    type: 'object',
    properties: {
        cycle: { type: 'number' },
        appData: { type: 'object' },
        dataID: { type: 'string' },
    },
    required: ['cycle', 'appData', 'dataID'],
    additionalProperties: false,
};
export function initCachedAppData(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.CachedAppData, schemaCachedAppData);
}