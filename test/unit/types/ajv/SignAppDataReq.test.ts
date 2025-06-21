import { initSignAppDataReq, schemaSignAppDataReq } from '../../../../src/types/ajv/SignAppDataReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('SignAppDataReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaSignAppDataReq', () => {
    it('should be an object type schema', () => {
      expect(schemaSignAppDataReq.type).toBe('object')
    })

    it('should have type property as string', () => {
      expect(schemaSignAppDataReq.properties.type).toEqual({ type: 'string' })
    })

    it('should have nodesToSign property as number', () => {
      expect(schemaSignAppDataReq.properties.nodesToSign).toEqual({ type: 'number' })
    })

    it('should have hash property as string', () => {
      expect(schemaSignAppDataReq.properties.hash).toEqual({ type: 'string' })
    })

    it('should have appData property as empty object (type unknown)', () => {
      expect(schemaSignAppDataReq.properties.appData).toEqual({})
    })

    it('should have exactly 4 properties', () => {
      expect(Object.keys(schemaSignAppDataReq.properties)).toHaveLength(4)
    })

    it('should require all fields', () => {
      expect(schemaSignAppDataReq.required).toEqual(['type', 'nodesToSign', 'hash', 'appData'])
    })

    it('should have exactly 4 required fields', () => {
      expect(schemaSignAppDataReq.required).toHaveLength(4)
    })

    it('should not have additionalProperties field', () => {
      expect('additionalProperties' in schemaSignAppDataReq).toBe(false)
    })
  })

  describe('initSignAppDataReq', () => {
    it('should call addSchema with correct parameters', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initSignAppDataReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.SignAppDataReq,
        schemaSignAppDataReq
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initSignAppDataReq()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should have all properties as required', () => {
      const propertyNames = Object.keys(schemaSignAppDataReq.properties)
      propertyNames.forEach(prop => {
        expect(schemaSignAppDataReq.required).toContain(prop)
      })
    })

    it('should require type field', () => {
      expect(schemaSignAppDataReq.required).toContain('type')
    })

    it('should require nodesToSign field', () => {
      expect(schemaSignAppDataReq.required).toContain('nodesToSign')
    })

    it('should require hash field', () => {
      expect(schemaSignAppDataReq.required).toContain('hash')
    })

    it('should require appData field', () => {
      expect(schemaSignAppDataReq.required).toContain('appData')
    })

    it('should have properties and required arrays with matching field counts', () => {
      const propertyCount = Object.keys(schemaSignAppDataReq.properties).length
      const requiredCount = schemaSignAppDataReq.required.length
      expect(propertyCount).toBe(requiredCount)
    })

    it('should not define type for appData property', () => {
      expect(schemaSignAppDataReq.properties.appData).toEqual({})
      expect('type' in schemaSignAppDataReq.properties.appData).toBe(false)
    })
  })
})