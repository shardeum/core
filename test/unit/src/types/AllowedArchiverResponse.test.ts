import { verifyPayload } from '../../../../src/types/ajv/Helpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { initAjvSchemas } from '../../../../src/types/ajv/Helpers'

describe('AllowedArchiverResponse Validation', () => {
  beforeAll(() => {
    initAjvSchemas()
  })

  test('should validate a correct AllowedArchiverResponse', () => {
    const validResponse = {
      allowedArchivers: [
        { ip: '127.0.0.1', port: 4000, publicKey: '2db7c949632d26b87d7e7a5a4ad41c306f63ee972655121a37c5e4f52b00a542' },
        { ip: '127.0.0.1', port: 4001, publicKey: '7af699dd711074eb96a8d1103e32b589e511613ebb0c6a789a9e8791b2b05f34' },
      ],
      signatures: [
        {
          owner: '0x002D3a2BfE09E3E29b6d38d58CaaD16EEe4C9BC5',
          sig: '0x17e8a1e5dd324ff627ec1ee7646df6a57d16aa2fbff9b2e4b025c310b7b38dd42067c3235c6c5c1ce1be3b0d11d0f367f4afe355a4183a58ff279a7e9c2ca9fb1c',
        },
      ],
    }

    const errors = verifyPayload(AJVSchemaEnum.AllowedArchiverResponse, validResponse)
    expect(errors).toBeNull()
  })

  test('should invalidate a response with missing allowedArchivers', () => {
    const invalidResponse = {
      signatures: [
        {
          owner: '0x002D3a2BfE09E3E29b6d38d58CaaD16EEe4C9BC5',
          sig: '0x17e8a1e5dd324ff627ec1ee7646df6a57d16aa2fbff9b2e4b025c310b7b38dd42067c3235c6c5c1ce1be3b0d11d0f367f4afe355a4183a58ff279a7e9c2ca9fb1c',
        },
      ],
    }

    const errors = verifyPayload(AJVSchemaEnum.AllowedArchiverResponse, invalidResponse)
    expect(errors).not.toBeNull()
  })

  test('should invalidate a response with missing signatures', () => {
    const invalidResponse = {
      allowedArchivers: [
        { ip: '127.0.0.1', port: 4000, publicKey: '2db7c949632d26b87d7e7a5a4ad41c306f63ee972655121a37c5e4f52b00a542' },
      ],
    }

    const errors = verifyPayload(AJVSchemaEnum.AllowedArchiverResponse, invalidResponse)
    expect(errors).not.toBeNull()
  })

  test('should invalidate a response with incorrect data types', () => {
    const invalidResponse = {
      allowedArchivers: [
        {
          ip: '127.0.0.1',
          port: '4000',
          publicKey: '2db7c949632d26b87d7e7a5a4ad41c306f63ee972655121a37c5e4f52b00a542',
        }, // port should be a number
      ],
      signatures: [
        { owner: '0x002D3a2BfE09E3E29b6d38d58CaaD16EEe4C9BC5', sig: 12345 }, // sig should be a string
      ],
    }

    const errors = verifyPayload(AJVSchemaEnum.AllowedArchiverResponse, invalidResponse)
    expect(errors).not.toBeNull()
  })

  test('should invalidate a response with additional properties', () => {
    const invalidResponse = {
      allowedArchivers: [
        { ip: '127.0.0.1', port: 4000, publicKey: '2db7c949632d26b87d7e7a5a4ad41c306f63ee972655121a37c5e4f52b00a542' },
      ],
      signatures: [
        {
          owner: '0x002D3a2BfE09E3E29b6d38d58CaaD16EEe4C9BC5',
          sig: '0x17e8a1e5dd324ff627ec1ee7646df6a57d16aa2fbff9b2e4b025c310b7b38dd42067c3235c6c5c1ce1be3b0d11d0f367f4afe355a4183a58ff279a7e9c2ca9fb1c',
        },
      ],
      additionalProperty: 'extra',
    }

    const errors = verifyPayload(AJVSchemaEnum.AllowedArchiverResponse, invalidResponse)
    expect(errors).not.toBeNull()
  })
})
