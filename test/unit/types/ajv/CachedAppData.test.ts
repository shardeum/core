import { initCachedAppData, schemaCachedAppData } from '../../../../src/types/ajv/CachedAppData'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('CachedAppData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaCachedAppData', () => {
    it('should be an object type schema', () => {
      expect(schemaCachedAppData.type).toBe('object')
    })

    it('should have cycle property as number', () => {
      expect(schemaCachedAppData.properties.cycle).toEqual({
        type: 'number',
      })
    })

    it('should have appData property as object', () => {
      expect(schemaCachedAppData.properties.appData).toEqual({
        type: 'object',
      })
    })

    it('should have dataID property as string', () => {
      expect(schemaCachedAppData.properties.dataID).toEqual({
        type: 'string',
      })
    })

    it('should have exactly 3 properties', () => {
      expect(Object.keys(schemaCachedAppData.properties)).toHaveLength(3)
    })

    it('should have all properties as required', () => {
      expect(schemaCachedAppData.required).toEqual(['cycle', 'appData', 'dataID'])
    })

    it('should have exactly 3 required fields', () => {
      expect(schemaCachedAppData.required).toHaveLength(3)
    })

    it('should not allow additional properties', () => {
      expect(schemaCachedAppData.additionalProperties).toBe(false)
    })
  })

  describe('initCachedAppData', () => {
    it('should call addSchema with correct parameters', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initCachedAppData()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.CachedAppData,
        schemaCachedAppData
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initCachedAppData()).not.toThrow()
    })
  })

  describe('schema validation rules', () => {
    it('should require cycle field', () => {
      expect(schemaCachedAppData.required).toContain('cycle')
    })

    it('should require appData field', () => {
      expect(schemaCachedAppData.required).toContain('appData')
    })

    it('should require dataID field', () => {
      expect(schemaCachedAppData.required).toContain('dataID')
    })

    it('should have properties and required arrays with matching field counts', () => {
      const propertyCount = Object.keys(schemaCachedAppData.properties).length
      const requiredCount = schemaCachedAppData.required.length
      expect(propertyCount).toBe(requiredCount)
    })

    it('should have all properties marked as required', () => {
      const propertyNames = Object.keys(schemaCachedAppData.properties)
      propertyNames.forEach(prop => {
        expect(schemaCachedAppData.required).toContain(prop)
      })
    })
  })
})