import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
import { schemaWrappedDataFromQueueSerializable } from './WrappedDataFromQueueSerializable';
export const schemaGetAccountDataWithQueueHintsResp = {
    properties: {
        accountData: {
            type: ['array', 'null'],
            items: schemaWrappedDataFromQueueSerializable,
        },
    },
    required: ['accountData'],
};
export function initGetAccountDataWithQueueHintsResp(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetAccountDataWithQueueHintsResp, schemaGetAccountDataWithQueueHintsResp);
}