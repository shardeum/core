import { strict as assert } from 'assert'
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
      assert.doesNotThrow(() => {
        freshModule.addSchema(schemaName, schema)
      })

      // Verify the schema was added by trying to get a verify function for it
      assert.doesNotThrow(() => {
        const verifyFn = freshModule.getVerifyFunction(schemaName)
        assert.ok(verifyFn)
        assert.equal(typeof verifyFn, 'function')
      })
    })

    it('should throw an error when adding a duplicate schema', () => {
      // Arrange
      const schemaName = 'duplicateSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      // Act - Add the schema once
      freshModule.addSchema(schemaName, schema)

      // Assert - Adding it again should throw
      assert.throws(() => {
        freshModule.addSchema(schemaName, schema)
      }, /error already registered duplicateSchema/)
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
      assert.doesNotThrow(() => {
        freshModule.initializeSerialization()
      })
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
      assert.doesNotThrow(() => {
        freshModule.initializeSerialization()
      })
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
      assert.doesNotThrow(() => {
        freshModule.initializeSerialization()
      })
    })

    it('should throw an error on missing schema', () => {
      // Arrange
      const dependencyName = 'missingSchema'
      const requiredByName = 'requiringSchema'

      // Act - Add dependency without adding the schema
      freshModule.addSchemaDependency(dependencyName, requiredByName)

      // Assert
      assert.throws(() => {
        freshModule.initializeSerialization()
      }, /error missing schema missingSchema required by requiringSchema/)
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
      assert.doesNotThrow(() => {
        freshModule.initializeSerialization()
      })
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
      assert.strictEqual(firstCall, secondCall, 'Should return the same function instance on cache hit')
    })

    it('should create a new function (cache miss)', () => {
      // Arrange
      const schemaName = 'cacheMissSchema'
      const schema = { type: 'object', properties: { test: { type: 'string' } } }

      freshModule.addSchema(schemaName, schema)

      // Act
      const verifyFn = freshModule.getVerifyFunction(schemaName)

      // Assert
      assert.ok(verifyFn)
      assert.equal(typeof verifyFn, 'function')
    })

    it('should throw an error on missing schema', () => {
      // Arrange
      const nonExistentSchema = 'nonExistentSchema'

      // Act & Assert
      assert.throws(() => {
        freshModule.getVerifyFunction(nonExistentSchema)
      }, /error missing schema nonExistentSchema/)
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
      assert.equal(verifyFn(validData), true)

      // Assert - Invalid data (missing required property)
      const invalidData = { optionalProp: 123 }
      assert.equal(verifyFn(invalidData), false)

      // Assert - Invalid data (wrong type)
      const wrongTypeData = { requiredProp: 123 }
      assert.equal(verifyFn(wrongTypeData), false)
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
      assert.ok(parentVerifyFn)
      assert.ok(childVerifyFn)

      // Verify parent schema validation
      assert.equal(parentVerifyFn({ id: '123' }), true)
      assert.equal(parentVerifyFn({ id: 123 }), false)

      // Verify child schema validation
      assert.equal(childVerifyFn({ parentId: '123', name: 'Test' }), true)
      assert.equal(childVerifyFn({ parentId: 123, name: 'Test' }), false)
    })
  })
})
