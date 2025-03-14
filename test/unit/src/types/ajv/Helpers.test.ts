import { expect } from '@jest/globals'
import { ErrorObject } from 'ajv'
import * as SchemaHelpers from '../../../../../src/utils/serialization/SchemaHelpers'
import * as Helpers from '../../../../../src/types/ajv/Helpers'

//------------------------------------------------------------------------------
// Mock Setup - All mocking is consolidated here
//------------------------------------------------------------------------------

// Mock the SchemaHelpers module with all required functions
jest.mock('../../../../../src/utils/serialization/SchemaHelpers', () => ({
  getVerifyFunction: jest.fn(),
  addSchema: jest.fn(),
  addSchemaDependency: jest.fn(),
  initializeSerialization: jest.fn(),
}))

// Define all schema modules we need to mock
const mockModules = [
  { path: 'ApoptosisProposalReq', init: 'initApoptosisProposalReq' },
  { path: 'ApoptosisProposalResp', init: 'initApoptosisProposalResp' },
  { path: 'BroadcastStateReq', init: 'initBroadcastStateReq' },
  { path: 'CachedAppData', init: 'initCachedAppData' },
  { path: 'CompareCert', init: 'initCompareCertReq' },
  { path: 'GetAccountData3Req', init: 'initGetAccountData3Req' },
  { path: 'GetAccountDataByHashesReq', init: 'initGetAccountDataByHashesReq' },
  { path: 'GetAccountDataByHashesResp', init: 'initGetAccountDataByHashesResp' },
  { path: 'GetAccountDataByListReq', init: 'initGetAccountDataByListReq' },
  { path: 'GetAccountDataByListResp', init: 'initGetAccountDataByListResp' },
  { path: 'GetAccountDataResp', init: 'initGetAccountDataRespSerializable' },
  { path: 'GetAccountDataWithQueueHintsReq', init: 'initGetAccountDataWithQueueHintsReq' },
  { path: 'GetAccountDataWithQueueHintsResp', init: 'initGetAccountDataWithQueueHintsResp' },
  { path: 'GetAccountQueueCountReq', init: 'initGetAccountQueueCountReq' },
  { path: 'GetAccountQueueCountResp', init: 'initGetAccountQueueCountResp' },
  { path: 'GetAppliedVoteReq', init: 'initGetAppliedVoteReq' },
  { path: 'GetAppliedVoteResp', init: 'initGetAppliedVoteResp' },
  { path: 'GetCachedAppDataReq', init: 'initGetCachedAppDataReq' },
  { path: 'GetCachedAppDataResp', init: 'initGetCachedAppDataResp' },
  { path: 'GetTrieAccountHashesReq', init: 'initGetTrieAccountHashesReq' },
  { path: 'GetTrieAccountHashesResp', init: 'initGetTrieAccountHashesResp' },
  { path: 'GetTrieHashesReq', init: 'initGetTrieHashesReq' },
  { path: 'GetTrieHashesResp', init: 'initGetTrieHashesResp' },
  { path: 'GetTxTimestampReq', init: 'initGetTxTimestampReq' },
  { path: 'GetTxTimestampResp', init: 'initGetTxTimestampResp' },
  { path: 'GlobalAccountReportReq', init: 'initGlobalAccountReportReq' },
  { path: 'GlobalAccountReportResp', init: 'initGlobalAccountReportResp' },
  { path: 'LostReportReq', init: 'initLostReportReq' },
  { path: 'MakeReceiptReq', init: 'initMakeReceiptReq' },
  { path: 'SignAppDataReq', init: 'initSignAppDataReq' },
  { path: 'SignAppDataResp', init: 'initSignAppDataResp' },
  { path: 'RepairOOSAccountsReq', init: 'initRepairOOSAccountReq' },
  { path: 'RequestReceiptForTxReq', init: 'initRequestReceiptForTxReq' },
  { path: 'RequestReceiptForTxResp', init: 'initRequestReceiptForTxResp' },
  { path: 'RequestStateForTxPostReq', init: 'initRequestStateForTxPostReq' },
  { path: 'RequestStateForTxPostResp', init: 'initRequestStateForTxPostResp' },
  { path: 'RequestStateForTxReq', init: 'initRequestStateForTxReq' },
  { path: 'RequestStateForTxResp', init: 'initRequestStateForTxResp' },
  { path: 'sendCachedAppDataReq', init: 'initSendCachedAppDataReq' },
  { path: 'SpreadAppliedVoteHashReq', init: 'initSpreadAppliedVoteHashReq' },
  { path: 'SpreadTxToGroupSyncingReq', init: 'initSpreadTxToGroupSyncingReq' },
  { path: 'SyncTrieHashesReq', init: 'initSyncTrieHashesReq' },
  { path: 'WrappedData', init: 'initWrappedData' },
  { path: 'WrappedDataFromQueueSerializable', init: 'initWrappedDataFromQueueSerializable' },
  { path: 'WrappedDataResponse', init: 'initWrappedDataResponse' },
  { path: 'CycleRecordSchema', init: 'initCycleRecords' },
  { path: 'JoinReq', init: 'initJoinReq' },
  { path: 'AllowedArchiverResponse', init: 'initAllowedArchiverResponse' },
]

// Create a helper function to generate mock modules with proper implementation
const createMockModule = (initFunctionName: string) => ({
  [initFunctionName]: jest.fn(),
})

// Apply all mocks for schema modules
mockModules.forEach(({ path, init }) => {
  jest.mock(`../../../../../src/types/ajv/${path}`, () => createMockModule(init))
})

// Create a mock registry to store all mock functions
const mockRegistry = new Map<string, jest.Mock>()

// Pre-load all mocked modules and store their functions in the registry
mockModules.forEach(({ path, init }) => {
  const mockModule = jest.requireMock(`../../../../../src/types/ajv/${path}`)
  mockRegistry.set(init, mockModule[init])
})

// Helper function to create a mock verify function with proper typing
const createMockVerifyFn = (isValid: boolean, errors: ErrorObject[] | null) => {
  const mockFn = jest.fn().mockReturnValue(isValid) as jest.Mock & { errors: ErrorObject[] | null }
  mockFn.errors = errors
  return mockFn
}

// Mock implementation for initAjvSchemas that calls all schema init functions
const mockInitAjvSchemas = () => {
  mockModules.forEach(({ init }) => {
    const mockFn = mockRegistry.get(init)
    if (mockFn) {
      mockFn()
    }
  })
}

// Mock implementation for initAjvSchemas that throws an error
const mockInitAjvSchemasWithError = () => {
  const mockFn = mockRegistry.get('initGetAccountData3Req')
  if (mockFn) {
    mockFn()
  }
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe('Helpers', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initAjvSchemas', () => {
    it('should call all schema initialization functions', () => {
      // Setup - Mock the implementation of initAjvSchemas for this test
      const spy = jest.spyOn(Helpers, 'initAjvSchemas').mockImplementation(mockInitAjvSchemas)

      // Execute - Call the function under test
      Helpers.initAjvSchemas()

      // Verify - All initialization functions were called
      mockModules.forEach(({ init }) => {
        const mockFn = mockRegistry.get(init)
        expect(mockFn).toHaveBeenCalled()
      })

      // Cleanup - Restore the original implementation
      spy.mockRestore()
    })

    it('should handle errors in schema initialization', () => {
      // Setup - Get the mock function for GetAccountData3Req and make it throw an error
      const mockGetAccountData3Req = mockRegistry.get('initGetAccountData3Req')
      if (mockGetAccountData3Req) {
        mockGetAccountData3Req.mockImplementationOnce(() => {
          throw new Error('Schema initialization error')
        })
      }

      // Setup - Mock the implementation of initAjvSchemas for this test
      const spy = jest.spyOn(Helpers, 'initAjvSchemas').mockImplementation(mockInitAjvSchemasWithError)

      // Verify - The error is propagated (not caught)
      expect(() => {
        Helpers.initAjvSchemas()
      }).toThrow('Schema initialization error')

      // Cleanup - Restore the original implementation
      spy.mockRestore()
    })
  })

  describe('verifyPayload', () => {
    it('should return null for valid payloads', () => {
      // Setup - Create a mock verify function that returns true (valid)
      const mockVerifyFn = createMockVerifyFn(true, null)
      ;(SchemaHelpers.getVerifyFunction as jest.Mock).mockReturnValue(mockVerifyFn)

      // Execute - Call the function under test
      const result = Helpers.verifyPayload('testSchema', { test: 'data' })

      // Verify - The result should be null (no errors)
      expect(result).toBeNull()
      expect(SchemaHelpers.getVerifyFunction).toHaveBeenCalledWith('testSchema')
      expect(mockVerifyFn).toHaveBeenCalledWith({ test: 'data' })
    })

    it('should return error messages for invalid payloads', () => {
      // Setup - Create a mock verify function that returns errors
      const errors = [
        {
          keyword: 'required',
          dataPath: '',
          schemaPath: '#/required',
          params: { missingProperty: 'requiredField' },
          message: 'should have required property',
        },
      ] as ErrorObject[]

      const mockVerifyFn = createMockVerifyFn(false, errors)
      ;(SchemaHelpers.getVerifyFunction as jest.Mock).mockReturnValue(mockVerifyFn)

      // Execute - Call the function under test
      const result = Helpers.verifyPayload('testSchema', { test: 'data' })

      // Verify - The result should contain formatted error messages
      expect(result).toEqual(['should have required property: {"missingProperty":"requiredField"}'])
      expect(SchemaHelpers.getVerifyFunction).toHaveBeenCalledWith('testSchema')
      expect(mockVerifyFn).toHaveBeenCalledWith({ test: 'data' })
    })

    it('should handle multiple validation errors', () => {
      // Setup - Create a mock verify function that returns multiple errors
      const errors = [
        {
          keyword: 'required',
          dataPath: '',
          schemaPath: '#/required',
          params: { missingProperty: 'requiredField1' },
          message: 'should have required property',
        },
        {
          keyword: 'type',
          dataPath: '.age',
          schemaPath: '#/properties/age/type',
          params: { type: 'number' },
          message: 'should be number',
        },
      ] as ErrorObject[]

      const mockVerifyFn = createMockVerifyFn(false, errors)
      ;(SchemaHelpers.getVerifyFunction as jest.Mock).mockReturnValue(mockVerifyFn)

      // Execute - Call the function under test
      const result = Helpers.verifyPayload('testSchema', { test: 'data', age: 'not-a-number' })

      // Verify - The result should contain all formatted error messages
      expect(result).toEqual([
        'should have required property: {"missingProperty":"requiredField1"}',
        'should be number: {"type":"number"}',
      ])
    })

    it('should handle errors without params', () => {
      // Setup - Create a mock verify function that returns an error without params
      const errors = [
        {
          keyword: 'custom',
          dataPath: '',
          schemaPath: '#/custom',
          message: 'custom validation failed',
        },
      ] as ErrorObject[]

      const mockVerifyFn = createMockVerifyFn(false, errors)
      ;(SchemaHelpers.getVerifyFunction as jest.Mock).mockReturnValue(mockVerifyFn)

      // Execute - Call the function under test
      const result = Helpers.verifyPayload('testSchema', { test: 'data' })

      // Verify - The result should contain the error message without params
      expect(result).toEqual(['custom validation failed'])
    })

    it('should handle non-existent schema', () => {
      // Setup - Mock getVerifyFunction to throw an error
      ;(SchemaHelpers.getVerifyFunction as jest.Mock).mockImplementation(() => {
        throw new Error('Schema not found')
      })

      // Verify - The error is propagated
      expect(() => {
        Helpers.verifyPayload('nonExistentSchema', { test: 'data' })
      }).toThrow('Schema not found')
    })

    it('should handle null errors array', () => {
      // Setup - Create a mock verify function that returns false but has null errors
      const mockVerifyFn = createMockVerifyFn(false, null)
      ;(SchemaHelpers.getVerifyFunction as jest.Mock).mockReturnValue(mockVerifyFn)

      // Execute - Call the function under test
      const result = Helpers.verifyPayload('testSchema', { test: 'data' })

      // Verify - The result should be null since there are no errors
      expect(result).toBeNull()
    })

    it('should handle empty errors array', () => {
      // Setup - Create a mock verify function that returns false but has empty errors array
      const mockVerifyFn = createMockVerifyFn(false, [])
      ;(SchemaHelpers.getVerifyFunction as jest.Mock).mockReturnValue(mockVerifyFn)

      // Execute - Call the function under test
      const result = Helpers.verifyPayload('testSchema', { test: 'data' })

      // Verify - The result should be an empty array
      expect(result).toEqual([])
    })
  })
})
