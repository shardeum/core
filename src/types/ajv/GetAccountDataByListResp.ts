import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
import { schemaWrappedData } from './WrappedData';
export const schemaGetAccountDataByListResp = {
    properties: {
        accountData: {
            type: ['array', 'null'],
            items: schemaWrappedData,
        },
    },
    required: ['accountData'],
};
export function initGetAccountDataByListResp(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.GetAccountDataByListResp, schemaGetAccountDataByListResp);
}