import * as SchemaHelpers from '../../../../../src/utils/serialization/SchemaHelpers'

// Helper function to reset module state between tests
function resetModuleState() {
  jest.resetModules()
  // Re-import the module to get fresh state
  return require('../../../../../src/utils/serialization/SchemaHelpers')
}

describe('SchemaHelpers', () => {
  // Create a fresh module instance before each test
  let freshModule: typeof SchemaHelpers

  beforeEach(() => {
    freshModule = resetModuleState()
  })

  describe('addSchema', () => {
    it('should add a schema successfully', () => {
      // Arrange
      const schemaName = 'testSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      // Act & Assert - if no error is thrown, the schema was added successfully
      expect(() => {
        freshModule.addSchema(schemaName, schema)
      }).not.toThrow()

      // Verify the schema was added by trying to get a verify function for it
      expect(() => {
        const verifyFn = freshModule.getVerifyFunction(schemaName)
        expect(verifyFn).toBeDefined()
        expect(typeof verifyFn).toBe('function')
      }).not.toThrow()
    })

    it('should throw an error when adding a duplicate schema', () => {
      // Arrange
      const schemaName = 'duplicateSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      // Act - Add the schema once
      freshModule.addSchema(schemaName, schema)

      // Assert - Adding it again should throw
      expect(() => {
        freshModule.addSchema(schemaName, schema)
      }).toThrow(/error already registered duplicateSchema/)
    })
  })

  describe('addSchemaDependency', () => {
    it('should add a dependency relationship', () => {
      // Arrange
      const dependencyName = 'dependencySchema'
      const requiredByName = 'requiringSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      // Act
      freshModule.addSchema(dependencyName, schema)
      freshModule.addSchemaDependency(dependencyName, requiredByName)

      // Assert - initialization should succeed if dependency was properly registered
      expect(() => {
        freshModule.initializeSerialization()
      }).not.toThrow()
    })

    it('should overwrite an existing dependency', () => {
      // Arrange
      const dependencyName1 = 'dependencySchema1'
      const dependencyName2 = 'dependencySchema2'
      const requiredByName = 'requiringSchema'
      const schema1 = { type: 'object', properties: { test1: { type: 'string' } } }
      const schema2 = { type: 'object', properties: { test2: { type: 'string' } } }

      // Act
      freshModule.addSchema(dependencyName1, schema1)
      freshModule.addSchema(dependencyName2, schema2)

      // Add first dependency
      freshModule.addSchemaDependency(dependencyName1, requiredByName)

      // Overwrite with second dependency
      freshModule.addSchemaDependency(dependencyName2, requiredByName)

      // Assert - initialization should succeed with the second dependency
      expect(() => {
        freshModule.initializeSerialization()
      }).not.toThrow()
    })
  })

  describe('initializeSerialization', () => {
    it('should initialize schemas with valid dependencies', () => {
      // Arrange
      const dependencyName = 'dependencySchema'
      const requiredByName = 'requiringSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      freshModule.addSchema(dependencyName, schema)
      freshModule.addSchemaDependency(dependencyName, requiredByName)

      // Act & Assert
      expect(() => {
        freshModule.initializeSerialization()
      }).not.toThrow()
    })

    it('should throw an error on missing schema', () => {
      // Arrange
      const dependencyName = 'missingSchema'
      const requiredByName = 'requiringSchema'

      // Act - Add dependency without adding the schema
      freshModule.addSchemaDependency(dependencyName, requiredByName)

      // Assert
      expect(() => {
        freshModule.initializeSerialization()
      }).toThrow(/error missing schema missingSchema required by requiringSchema/)
    })

    it('should handle multiple dependencies', () => {
      // Arrange
      const schema1 = { type: 'object', properties: { test1: { type: 'string' } } }
      const schema2 = { type: 'object', properties: { test2: { type: 'string' } } }

      freshModule.addSchema('schema1', schema1)
      freshModule.addSchema('schema2', schema2)

      freshModule.addSchemaDependency('schema1', 'requiring1')
      freshModule.addSchemaDependency('schema2', 'requiring2')

      // Act & Assert
      expect(() => {
        freshModule.initializeSerialization()
      }).not.toThrow()
    })
  })

  describe('getVerifyFunction', () => {
    it('should retrieve an existing function (cache hit)', () => {
      // Arrange
      const schemaName = 'cacheHitSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      freshModule.addSchema(schemaName, schema)

      // Act - Get the function for the first time (cache miss)
      const firstCall = freshModule.getVerifyFunction(schemaName)

      // Get the function again (should be a cache hit)
      const secondCall = freshModule.getVerifyFunction(schemaName)

      // Assert
      expect(firstCall).toBe(secondCall)
    })

    it('should create a new function (cache miss)', () => {
      // Arrange
      const schemaName = 'cacheMissSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      freshModule.addSchema(schemaName, schema)

      // Act
      const verifyFn = freshModule.getVerifyFunction(schemaName)

      // Assert
      expect(verifyFn).toBeDefined()
      expect(typeof verifyFn).toBe('function')
    })

    it('should throw an error on missing schema', () => {
      // Arrange
      const nonExistentSchema = 'nonExistentSchema'

      // Act & Assert
      expect(() => {
        freshModule.getVerifyFunction(nonExistentSchema)
      }).toThrow(/error missing schema nonExistentSchema/)
    })

    it('should return a function that validates according to the schema', () => {
      // Arrange
      const schemaName = 'validationSchema'
      const schema = {
        type: 'object',
        required: ['requiredProp'],
        properties: {
          requiredProp: { type: 'string' },
          optionalProp: { type: 'number' },
        },
      }

      freshModule.addSchema(schemaName, schema)

      // Act
      const verifyFn = freshModule.getVerifyFunction(schemaName)

      // Assert - Valid data
      const validData = { requiredProp: 'test', optionalProp: 123 }
      expect(verifyFn(validData)).toBe(true)

      // Assert - Invalid data (missing required property)
      const invalidData = { optionalProp: 123 }
      expect(verifyFn(invalidData)).toBe(false)

      // Assert - Invalid data (wrong type)
      const wrongTypeData = { requiredProp: 123 }
      expect(verifyFn(wrongTypeData)).toBe(false)
    })
  })

  describe('Integration tests', () => {
    it('should support the full workflow: add schemas → add dependencies → initialize → get verify function', () => {
      // Arrange
      const parentSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      }

      const childSchema = {
        type: 'object',
        properties: {
          parentId: { type: 'string' },
          name: { type: 'string' },
        },
      }

      // Act
      freshModule.addSchema('parent', parentSchema)
      freshModule.addSchema('child', childSchema)

      freshModule.addSchemaDependency('parent', 'child')

      freshModule.initializeSerialization()

      const parentVerifyFn = freshModule.getVerifyFunction('parent')
      const childVerifyFn = freshModule.getVerifyFunction('child')

      // Assert
      expect(parentVerifyFn).toBeDefined()
      expect(childVerifyFn).toBeDefined()

      // Verify parent schema validation
      expect(parentVerifyFn({ id: '123' })).toBe(true)
      expect(parentVerifyFn({ id: 123 })).toBe(false)

      // Verify child schema validation
      expect(childVerifyFn({ parentId: '123', name: 'Test' })).toBe(true)
      expect(childVerifyFn({ parentId: 123, name: 'Test' })).toBe(false)
    })
  })
})
