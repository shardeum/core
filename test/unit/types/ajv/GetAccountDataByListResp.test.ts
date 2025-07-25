import {
  initGetAccountDataByListResp,
  schemaGetAccountDataByListResp,
} from '../../../../src/types/ajv/GetAccountDataByListResp'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedData } from '../../../../src/types/ajv/WrappedData'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('GetAccountDataByListResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGetAccountDataByListResp', () => {
    it('should have properties field', () => {
      expect(schemaGetAccountDataByListResp.properties).toBeDefined()
    })

    it('should have accountData property', () => {
      expect(schemaGetAccountDataByListResp.properties.accountData).toBeDefined()
    })

    it('should define accountData as array or null type', () => {
      expect(schemaGetAccountDataByListResp.properties.accountData.type).toEqual(['array', 'null'])
    })

    it('should use schemaWrappedData for array items', () => {
      expect(schemaGetAccountDataByListResp.properties.accountData.items).toBe(schemaWrappedData)
    })

    it('should have exactly 1 property', () => {
      expect(Object.keys(schemaGetAccountDataByListResp.properties)).toHaveLength(1)
    })

    it('should require accountData field', () => {
      expect(schemaGetAccountDataByListResp.required).toEqual(['accountData'])
    })

    it('should have exactly 1 required field', () => {
      expect(schemaGetAccountDataByListResp.required).toHaveLength(1)
    })

    it('should not have a type property at root level', () => {
      expect('type' in schemaGetAccountDataByListResp).toBe(false)
    })

    it('should not have additionalProperties field', () => {
      expect('additionalProperties' in schemaGetAccountDataByListResp).toBe(false)
    })
  })

  describe('initGetAccountDataByListResp', () => {
    it('should call addSchema with correct parameters', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initGetAccountDataByListResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAccountDataByListResp, schemaGetAccountDataByListResp)
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetAccountDataByListResp()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should allow accountData to be an array', () => {
      const typeArray = schemaGetAccountDataByListResp.properties.accountData.type
      expect(typeArray).toContain('array')
    })

    it('should allow accountData to be null', () => {
      const typeArray = schemaGetAccountDataByListResp.properties.accountData.type
      expect(typeArray).toContain('null')
    })

    it('should reference the correct schema for array items', () => {
      const items = schemaGetAccountDataByListResp.properties.accountData.items
      expect(items).toHaveProperty('type', 'object')
      expect(items).toHaveProperty('properties')
      expect(items.properties).toHaveProperty('accountId')
      expect(items.properties).toHaveProperty('stateId')
      expect(items.properties).toHaveProperty('data')
      expect(items.properties).toHaveProperty('timestamp')
    })

    it('should have accountData as the only required field', () => {
      expect(schemaGetAccountDataByListResp.required).toContain('accountData')
      expect(schemaGetAccountDataByListResp.required.indexOf('accountData')).toBe(0)
    })
  })
})
