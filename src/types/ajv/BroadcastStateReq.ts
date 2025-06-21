import { addSchema } from '../../utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum'
import { schemaWrappedDataResponse } from './WrappedDataResponse'

const schemaBroadcastStateReq = {
  type: 'object',
  properties: {
    txid: { type: 'string' },
    stateList: {
      type: 'array',
      items: schemaWrappedDataResponse,
    },
  },
  required: ['txid', 'stateList'],
}
export function initBroadcastStateReq(): void {
  addSchemaDependencies()
  addSchemas()
}

function addSchemaDependencies(): void {
  // No dependencies to add
}

function addSchemas(): void {
  addSchema(AJVSchemaEnum.BroadcastStateReq, schemaBroadcastStateReq)
}
