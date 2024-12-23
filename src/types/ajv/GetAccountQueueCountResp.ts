import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const getAccountQueueCountRespSchema = {
    oneOf: [
        {
            type: 'object',
            properties: {
                counts: {
                    type: 'array',
                    items: { type: 'number' },
                },
                committingAppData: {
                    type: 'array',
                    items: {},
                },
                accounts: {
                    type: 'array',
                    items: {},
                },
            },
            required: ['counts', 'committingAppData', 'accounts'],
        },
        {
            type: 'boolean',
            enum: [false],
        },
    ],
};
export function initGetAccountQueueCountResp(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetAccountQueueCountResp, getAccountQueueCountRespSchema);
}