import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { schemaWrappedData } from './WrappedData';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
export const schemaWrappedDataResponse = {
    type: 'object',
    properties: {
        ...schemaWrappedData.properties,
        accountCreated: { type: 'boolean' },
        isPartial: { type: 'boolean' },
    },
    required: [...schemaWrappedData.required, 'accountCreated', 'isPartial'],
};
export function initWrappedDataResponse(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.WrappedDataResponse, schemaWrappedDataResponse);
}