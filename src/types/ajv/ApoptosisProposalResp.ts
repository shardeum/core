import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaApoptosisResp = {
    type: 'object',
    properties: {
        s: { type: 'string' },
        r: { type: 'number' },
    },
    required: ['s', 'r'],
};
export function initApoptosisProposalResp(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.ApoptosisProposalResp, schemaApoptosisResp);
}