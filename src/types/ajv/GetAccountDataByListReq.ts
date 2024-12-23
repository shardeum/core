import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaGetAccountDataByListReq = {
    properties: {
        accountIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['accountIds'],
};
export function initGetAccountDataByListReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetAccountDataByListReq, schemaGetAccountDataByListReq);
}