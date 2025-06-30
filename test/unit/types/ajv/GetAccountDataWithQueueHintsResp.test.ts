import { initGetAccountDataWithQueueHintsResp, schemaGetAccountDataWithQueueHintsResp } from '../../../../src/types/ajv/GetAccountDataWithQueueHintsResp'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedDataFromQueueSerializable } from '../../../../src/types/ajv/WrappedDataFromQueueSerializable'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('GetAccountDataWithQueueHintsResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGetAccountDataWithQueueHintsResp', () => {
    it('should have properties field', () => {
      expect(schemaGetAccountDataWithQueueHintsResp.properties).toBeDefined()
    })

    it('should have accountData property', () => {
      expect(schemaGetAccountDataWithQueueHintsResp.properties.accountData).toBeDefined()
    })

    it('should define accountData as array or null type', () => {
      expect(schemaGetAccountDataWithQueueHintsResp.properties.accountData.type).toEqual(['array', 'null'])
    })

    it('should use schemaWrappedDataFromQueueSerializable for array items', () => {
      expect(schemaGetAccountDataWithQueueHintsResp.properties.accountData.items).toBe(schemaWrappedDataFromQueueSerializable)
    })

    it('should have exactly 1 property', () => {
      expect(Object.keys(schemaGetAccountDataWithQueueHintsResp.properties)).toHaveLength(1)
    })

    it('should require accountData field', () => {
      expect(schemaGetAccountDataWithQueueHintsResp.required).toEqual(['accountData'])
    })

    it('should have exactly 1 required field', () => {
      expect(schemaGetAccountDataWithQueueHintsResp.required).toHaveLength(1)
    })

    it('should not have a type property at root level', () => {
      expect('type' in schemaGetAccountDataWithQueueHintsResp).toBe(false)
    })

    it('should not have additionalProperties field', () => {
      expect('additionalProperties' in schemaGetAccountDataWithQueueHintsResp).toBe(false)
    })
  })

  describe('initGetAccountDataWithQueueHintsResp', () => {
    it('should call addSchema with correct parameters', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initGetAccountDataWithQueueHintsResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAccountDataWithQueueHintsResp,
        schemaGetAccountDataWithQueueHintsResp
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetAccountDataWithQueueHintsResp()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should allow accountData to be an array', () => {
      const typeArray = schemaGetAccountDataWithQueueHintsResp.properties.accountData.type
      expect(typeArray).toContain('array')
    })

    it('should allow accountData to be null', () => {
      const typeArray = schemaGetAccountDataWithQueueHintsResp.properties.accountData.type
      expect(typeArray).toContain('null')
    })

    it('should reference the correct schema for array items', () => {
      const items = schemaGetAccountDataWithQueueHintsResp.properties.accountData.items
      expect(items).toHaveProperty('type', 'object')
      expect(items).toHaveProperty('properties')
      expect(items.properties).toHaveProperty('accountId')
      expect(items.properties).toHaveProperty('stateId')
      expect(items.properties).toHaveProperty('data')
      expect(items.properties).toHaveProperty('timestamp')
      expect(items.properties).toHaveProperty('seenInQueue')
    })

    it('should use schema with seenInQueue property', () => {
      const items = schemaGetAccountDataWithQueueHintsResp.properties.accountData.items
      expect(items.properties.seenInQueue).toEqual({ type: 'boolean' })
    })

    it('should have accountData as the only required field', () => {
      expect(schemaGetAccountDataWithQueueHintsResp.required).toContain('accountData')
      expect(schemaGetAccountDataWithQueueHintsResp.required.indexOf('accountData')).toBe(0)
    })
  })
})