import { addSchema } from '../../utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../enum/AJVSchemaEnum'

export const schemaAllowedArchiverResponse = {
  type: 'object',
  properties: {
    allowedArchivers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ip: { type: 'string' },
          port: { type: 'number' },
          publicKey: { type: 'string' },
        },
        required: ['ip', 'port', 'publicKey'],
      },
    },
    signatures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          sig: { type: 'string' },
        },
        required: ['owner', 'sig'],
      },
    },
  },
  required: ['allowedArchivers', 'signatures'],
  additionalProperties: false,
}

export function initAllowedArchiverResponse(): void {
  addSchemaDependencies()
  addSchemas()
}

function addSchemaDependencies(): void {
  // No dependencies
}

function addSchemas(): void {
  addSchema(AJVSchemaEnum.AllowedArchiverResponse, schemaAllowedArchiverResponse)
}
