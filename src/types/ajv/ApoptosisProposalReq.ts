import { addSchema } from '../../utils/serialization/SchemaHelpers';
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum';
const schemaApoptosisReq = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        when: { type: 'number' },
    },
    required: ['id', 'when'],
};
export function initApoptosisProposalReq(): void {
    addSchemaDependencies();
    addSchemas();
}
function addSchemaDependencies(): void {
}
function addSchemas(): void {
    addSchema(AJVSchemaEnum.ApoptosisProposalReq, schemaApoptosisReq);
}