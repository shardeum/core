import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaGetAccountDataWithQueueHintsReq = {
    properties: {
        accountIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['accountIds'],
};
export function initGetAccountDataWithQueueHintsReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetAccountDataWithQueueHintsReq, schemaGetAccountDataWithQueueHintsReq);
}