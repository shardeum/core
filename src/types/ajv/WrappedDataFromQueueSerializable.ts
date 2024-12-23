import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { schemaWrappedData } from './WrappedData';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
export const schemaWrappedDataFromQueueSerializable = {
    type: 'object',
    properties: {
        ...schemaWrappedData.properties,
        seenInQueue: { type: 'boolean' },
    },
    required: [...schemaWrappedData.required, 'seenInQueue'],
};
export function initWrappedDataFromQueueSerializable(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.WrappedDataFromQueueSerializable, schemaWrappedDataFromQueueSerializable);
}