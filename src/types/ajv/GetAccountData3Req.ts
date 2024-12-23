import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaGetAccountData3Req = {
    type: 'object',
    properties: {
        accountStart: { type: 'string' },
        accountEnd: { type: 'string' },
        tsStart: { type: 'number' },
        maxRecords: { type: 'number' },
        offset: { type: 'number' },
        accountOffset: { type: 'string' },
    },
    required: ['accountStart', 'accountEnd', 'tsStart', 'maxRecords', 'offset', 'accountOffset'],
};
export function initGetAccountData3Req(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetAccountDataReq, schemaGetAccountData3Req);
}