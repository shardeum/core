import {
  initWrappedDataFromQueueSerializable,
  schemaWrappedDataFromQueueSerializable,
} from '../../../../src/types/ajv/WrappedDataFromQueueSerializable'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedData } from '../../../../src/types/ajv/WrappedData'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('WrappedDataFromQueueSerializable', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaWrappedDataFromQueueSerializable', () => {
    it('should be an object type schema', () => {
      expect(schemaWrappedDataFromQueueSerializable.type).toBe('object')
    })

    it('should include all properties from schemaWrappedData plus seenInQueue', () => {
      expect(schemaWrappedDataFromQueueSerializable.properties).toEqual({
        ...schemaWrappedData.properties,
        seenInQueue: { type: 'boolean' },
      })
    })

    it('should have seenInQueue as a boolean property', () => {
      expect(schemaWrappedDataFromQueueSerializable.properties.seenInQueue).toEqual({
        type: 'boolean',
      })
    })

    it('should include all required fields from schemaWrappedData plus seenInQueue', () => {
      expect(schemaWrappedDataFromQueueSerializable.required).toEqual([...schemaWrappedData.required, 'seenInQueue'])
    })

    it('should have the correct required fields', () => {
      // Based on schemaWrappedData.required which includes: accountId, stateId, data, timestamp
      expect(schemaWrappedDataFromQueueSerializable.required).toContain('accountId')
      expect(schemaWrappedDataFromQueueSerializable.required).toContain('stateId')
      expect(schemaWrappedDataFromQueueSerializable.required).toContain('data')
      expect(schemaWrappedDataFromQueueSerializable.required).toContain('timestamp')
      expect(schemaWrappedDataFromQueueSerializable.required).toContain('seenInQueue')
    })

    it('should have exactly 5 required fields', () => {
      expect(schemaWrappedDataFromQueueSerializable.required).toHaveLength(5)
    })
  })

  describe('initWrappedDataFromQueueSerializable', () => {
    it('should call addSchema with correct parameters', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initWrappedDataFromQueueSerializable()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.WrappedDataFromQueueSerializable,
        schemaWrappedDataFromQueueSerializable
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initWrappedDataFromQueueSerializable()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should have inherited accountId property from WrappedData', () => {
      expect(schemaWrappedDataFromQueueSerializable.properties.accountId).toEqual({
        type: 'string',
      })
    })

    it('should have inherited stateId property from WrappedData', () => {
      expect(schemaWrappedDataFromQueueSerializable.properties.stateId).toEqual({
        type: 'string',
      })
    })

    it('should have inherited data property from WrappedData', () => {
      expect(schemaWrappedDataFromQueueSerializable.properties.data).toEqual({})
    })

    it('should have inherited timestamp property from WrappedData', () => {
      expect(schemaWrappedDataFromQueueSerializable.properties.timestamp).toEqual({
        type: 'number',
      })
    })

    it('should have inherited syncData property from WrappedData', () => {
      expect(schemaWrappedDataFromQueueSerializable.properties.syncData).toBeDefined()
      expect(schemaWrappedDataFromQueueSerializable.properties.syncData.anyOf).toBeDefined()
      expect(schemaWrappedDataFromQueueSerializable.properties.syncData.anyOf).toHaveLength(6)
    })
  })
})
