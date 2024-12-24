import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const getAccountQueueCountReqSchema = {
    type: 'object',
    properties: {
        accountIds: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    required: ['accountIds'],
};
export function initGetAccountQueueCountReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetAccountQueueCountReq, getAccountQueueCountReqSchema);
}