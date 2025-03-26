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

// Define a list of all schema modules with their init functions
const schemaModules = [
  { path: '../../../../../src/types/ajv/ApoptosisProposalReq', init: 'initApoptosisProposalReq' },
  { path: '../../../../../src/types/ajv/ApoptosisProposalResp', init: 'initApoptosisProposalResp' },
  { path: '../../../../../src/types/ajv/BroadcastStateReq', init: 'initBroadcastStateReq' },
  { path: '../../../../../src/types/ajv/CachedAppData', init: 'initCachedAppData' },
  { path: '../../../../../src/types/ajv/CompareCert', init: 'initCompareCertReq' },
  { path: '../../../../../src/types/ajv/GetAccountData3Req', init: 'initGetAccountData3Req' },
  { path: '../../../../../src/types/ajv/GetAccountDataByHashesReq', init: 'initGetAccountDataByHashesReq' },
  { path: '../../../../../src/types/ajv/GetAccountDataByHashesResp', init: 'initGetAccountDataByHashesResp' },
  { path: '../../../../../src/types/ajv/GetAccountDataByListReq', init: 'initGetAccountDataByListReq' },
  { path: '../../../../../src/types/ajv/GetAccountDataByListResp', init: 'initGetAccountDataByListResp' },
  { path: '../../../../../src/types/ajv/GetAccountDataResp', init: 'initGetAccountDataRespSerializable' },
  { path: '../../../../../src/types/ajv/GetAccountDataWithQueueHintsReq', init: 'initGetAccountDataWithQueueHintsReq' },
  {
    path: '../../../../../src/types/ajv/GetAccountDataWithQueueHintsResp',
    init: 'initGetAccountDataWithQueueHintsResp',
  },
  { path: '../../../../../src/types/ajv/GetAccountQueueCountReq', init: 'initGetAccountQueueCountReq' },
  { path: '../../../../../src/types/ajv/GetAccountQueueCountResp', init: 'initGetAccountQueueCountResp' },
  { path: '../../../../../src/types/ajv/GetAppliedVoteReq', init: 'initGetAppliedVoteReq' },
  { path: '../../../../../src/types/ajv/GetAppliedVoteResp', init: 'initGetAppliedVoteResp' },
  { path: '../../../../../src/types/ajv/GetCachedAppDataReq', init: 'initGetCachedAppDataReq' },
  { path: '../../../../../src/types/ajv/GetCachedAppDataResp', init: 'initGetCachedAppDataResp' },
  { path: '../../../../../src/types/ajv/GetTrieAccountHashesReq', init: 'initGetTrieAccountHashesReq' },
  { path: '../../../../../src/types/ajv/GetTrieAccountHashesResp', init: 'initGetTrieAccountHashesResp' },
  { path: '../../../../../src/types/ajv/GetTrieHashesReq', init: 'initGetTrieHashesReq' },
  { path: '../../../../../src/types/ajv/GetTrieHashesResp', init: 'initGetTrieHashesResp' },
  { path: '../../../../../src/types/ajv/GetTxTimestampReq', init: 'initGetTxTimestampReq' },
  { path: '../../../../../src/types/ajv/GetTxTimestampResp', init: 'initGetTxTimestampResp' },
  { path: '../../../../../src/types/ajv/GlobalAccountReportReq', init: 'initGlobalAccountReportReq' },
  { path: '../../../../../src/types/ajv/GlobalAccountReportResp', init: 'initGlobalAccountReportResp' },
  { path: '../../../../../src/types/ajv/LostReportReq', init: 'initLostReportReq' },
  { path: '../../../../../src/types/ajv/MakeReceiptReq', init: 'initMakeReceiptReq' },
  { path: '../../../../../src/types/ajv/SignAppDataReq', init: 'initSignAppDataReq' },
  { path: '../../../../../src/types/ajv/SignAppDataResp', init: 'initSignAppDataResp' },
  { path: '../../../../../src/types/ajv/RepairOOSAccountsReq', init: 'initRepairOOSAccountReq' },
  { path: '../../../../../src/types/ajv/RequestReceiptForTxReq', init: 'initRequestReceiptForTxReq' },
  { path: '../../../../../src/types/ajv/RequestReceiptForTxResp', init: 'initRequestReceiptForTxResp' },
  { path: '../../../../../src/types/ajv/RequestStateForTxPostReq', init: 'initRequestStateForTxPostReq' },
  { path: '../../../../../src/types/ajv/RequestStateForTxPostResp', init: 'initRequestStateForTxPostResp' },
  { path: '../../../../../src/types/ajv/RequestStateForTxReq', init: 'initRequestStateForTxReq' },
  { path: '../../../../../src/types/ajv/RequestStateForTxResp', init: 'initRequestStateForTxResp' },
  { path: '../../../../../src/types/ajv/sendCachedAppDataReq', init: 'initSendCachedAppDataReq' },
  { path: '../../../../../src/types/ajv/SpreadAppliedVoteHashReq', init: 'initSpreadAppliedVoteHashReq' },
  { path: '../../../../../src/types/ajv/SpreadTxToGroupSyncingReq', init: 'initSpreadTxToGroupSyncingReq' },
  { path: '../../../../../src/types/ajv/SyncTrieHashesReq', init: 'initSyncTrieHashesReq' },
  { path: '../../../../../src/types/ajv/WrappedData', init: 'initWrappedData' },
  {
    path: '../../../../../src/types/ajv/WrappedDataFromQueueSerializable',
    init: 'initWrappedDataFromQueueSerializable',
  },
  { path: '../../../../../src/types/ajv/WrappedDataResponse', init: 'initWrappedDataResponse' },
  { path: '../../../../../src/types/ajv/CycleRecordSchema', init: 'initCycleRecords' },
  { path: '../../../../../src/types/ajv/JoinReq', init: 'initJoinReq' },
  { path: '../../../../../src/types/ajv/AllowedArchiverResponse', init: 'initAllowedArchiverResponse' },
]

// Helper function to create a mock verify function with proper typing
const createMockVerifyFn = (isValid: boolean, errors: ErrorObject[] | null) => {
  const mockFn = jest.fn().mockReturnValue(isValid) as jest.Mock & { errors: ErrorObject[] | null }
  mockFn.errors = errors
  return mockFn
}

// Set up all of our module spies
const moduleSpies: { [key: string]: jest.SpyInstance } = {}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe('Helpers', () => {
  // Set up and tear down spies for each test
  beforeEach(() => {
    // Create spies for all schema init functions - just monitor, don't replace implementation
    schemaModules.forEach((module) => {
      // Dynamically import the module
      const actualModule = jest.requireActual(module.path)
      // Create a spy for the init function without changing its implementation
      moduleSpies[module.init] = jest.spyOn(actualModule, module.init)
    })

    jest.clearAllMocks()
  })

  afterEach(() => {
    // Restore all spies
    Object.values(moduleSpies).forEach((spy) => spy.mockRestore())
  })

  describe('initAjvSchemas', () => {
    it('should call all schema initialization functions', () => {
      // Execute - Call the function under test
      Helpers.initAjvSchemas()

      // Verify - All initialization functions were called
      schemaModules.forEach((module) => {
        expect(moduleSpies[module.init]).toHaveBeenCalled()
      })
    })

    it('should propagate errors from schema initialization', () => {
      // Setup - Make one of the spies throw an error
      moduleSpies['initGetAccountData3Req'].mockImplementationOnce(() => {
        throw new Error('Schema initialization error')
      })

      // Verify - The error is propagated (not caught)
      expect(() => {
        Helpers.initAjvSchemas()
      }).toThrow('Schema initialization error')

      // Verify the original function was called and replaced correctly
      expect(moduleSpies['initGetAccountData3Req']).toHaveBeenCalled()
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
