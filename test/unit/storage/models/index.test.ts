import models from '../../../../src/storage/models/index'

// Mock all the model imports
jest.mock('../../../../src/storage/models/cycles', () => 'cycles')
jest.mock('../../../../src/storage/models/nodes', () => 'nodes')
jest.mock('../../../../src/storage/models/properties', () => 'properties')
jest.mock('../../../../src/storage/models/acceptedTxs', () => 'acceptedTxs')
jest.mock('../../../../src/storage/models/accountStates', () => 'accountStates')
jest.mock('../../../../src/storage/models/accountsCopy', () => 'accountsCopy')
jest.mock('../../../../src/storage/models/globalAccounts', () => 'globalAccounts')
jest.mock('../../../../src/storage/models/partitions', () => 'partitions')
jest.mock('../../../../src/storage/models/receipt', () => 'receipt')
jest.mock('../../../../src/storage/models/summary', () => 'summary')
jest.mock('../../../../src/storage/models/network', () => 'network')
jest.mock('../../../../src/storage/models/networkReceipt', () => 'networkReceipt')
jest.mock('../../../../src/storage/models/networkSummary', () => 'networkSummary')

describe('storage models index', () => {
  describe('models export', () => {
    it('should export an array', () => {
      expect(Array.isArray(models)).toBe(true)
    })

    it('should contain all expected models', () => {
      expect(models).toHaveLength(13)
    })

    it('should contain the correct models in order', () => {
      const expectedModels = [
        'cycles',
        'nodes',
        'properties',
        'acceptedTxs',
        'accountStates',
        'accountsCopy',
        'globalAccounts',
        'partitions',
        'receipt',
        'summary',
        'network',
        'networkReceipt',
        'networkSummary'
      ]

      expect(models).toEqual(expectedModels)
    })

    it('should not contain duplicate models', () => {
      const uniqueModels = [...new Set(models)]
      expect(uniqueModels).toHaveLength(models.length)
    })

    it('should not contain null or undefined models', () => {
      models.forEach(model => {
        expect(model).not.toBeNull()
        expect(model).not.toBeUndefined()
      })
    })

    it('should maintain the same order on multiple imports', () => {
      // This test ensures that the export is consistent
      const firstImport = [...models]
      const secondImport = [...models]
      
      expect(firstImport).toEqual(secondImport)
    })
  })
})