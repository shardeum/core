import { TypeIdentifierEnum } from '../../../../../src/types/enum/TypeIdentifierEnum';

describe('TypeIdentifierEnum', () => {
  it('should exist as an enum', () => {
    expect(TypeIdentifierEnum).toBeDefined();
    expect(typeof TypeIdentifierEnum).toBe('object');
  });

  it('should contain all expected enum values with correct numeric values', () => {
    // Define the expected enum values and their numeric values
    const expectedValues: Record<string, number> = {
      cApoptosisProposalReq: 1,
      cApoptosisProposalResp: 2,
      cWrappedReq: 3,
      cWrappedResp: 4,
      cWrappedDataResponse: 5,
      cWrappedData: 6,
      cBroadcastStateReq: 7,
      cSendCachedAppDataReq: 8,
      cCachedAppData: 9,
      cGetAccountDataWithQueueHintsReq: 10,
      cGetAccountDataWithQueueHintsResp: 11,
      cWrappedDataFromQueue: 12,
      cGetAccountQueueCountReq: 13,
      cGetAccountQueueCountResp: 14,
      cGetAccountDataByListReq: 15,
      cGetAccountDataByListResp: 16,
      cBroadcastFinalStateReq: 17,
      cGetAccountDataReq: 18,
      cGetAccountDataResp: 19,
      cSyncTrieHashesReq: 20,
      cCompareCertReq: 21,
      cCompareCertResp: 22,
      cGetTxTimestampReq: 23,
      cGetTxTimestampResp: 24,
      cGetTrieHashesReq: 25,
      cGetTrieHashesResp: 26,
      cGetAccountDataByHashesReq: 27,
      cGetAccountDataByHashesResp: 28,
      cSpreadTxToGroupSyncingReq: 29,
      cRequestStateForTxPostReq: 30,
      cRequestStateForTxPostResp: 31,
      cMakeReceiptReq: 32,
      cSpreadAppliedVoteHash: 33,
      cGlobalAccountReportReq: 34,
      cGlobalAccountReportResp: 35,
      cGetConfirmOrChallengeReq: 36,
      cGetConfirmOrChallengeResp: 37,
      cSignAppDataReq: 38,
      cSignAppDataResp: 39,
      cGetAccountTrieHashesReq: 40,
      cGetAccountTrieHashesResp: 41,
      cRadixAndChildHashes: 42,
      cGetCachedAppDataReq: 43,
      cGetCachedAppDataResp: 44,
      cRequestTxAndStateReq: 45,
      cRequestTxAndStateResp: 46,
      cLostArchiverInvestigateReq: 47,
      cRequestStateForTxReq: 48,
      cRequestStateForTxResp: 49,
      cRequestReceiptForTxReq: 50,
      cRequestReceiptForTxResp: 51,
      cGetAppliedVoteReq: 52,
      cSign: 53,
      cAppliedVote: 54,
      cGetAppliedVoteResp: 55,
      cLostReportReq: 56,
      cGossipReq: 57,
      cResponseError: 58,
      cConfirmOrChallengeMessage: 59,
      cAppliedReceipt2: 60,
      cRepairOOSAccountsReq: 61,
      cPoqoSendReceiptReq: 62,
      cPoqoDataAndReceiptReq: 63,
      cPoqoSendVoteReq: 64,
      cSignedReceipt: 65,
      cProposalVersion: 66
    };

    // Test all enum values
    Object.entries(expectedValues).forEach(([key, value]) => {
      expect(TypeIdentifierEnum[key as keyof typeof TypeIdentifierEnum]).toBe(value);
    });
  });

  it('should ensure all enum values are tested', () => {
    // Get all enum keys (excluding numeric keys)
    const enumKeys = Object.keys(TypeIdentifierEnum).filter(k => isNaN(Number(k)));
    
    // Get all enum values (excluding string keys)
    const enumValues = Object.values(TypeIdentifierEnum).filter(v => typeof v === 'number');
    
    // Verify we have the same number of keys and values
    expect(enumKeys.length).toBe(enumValues.length);
    
    // Verify we have the expected number of enum values
    expect(enumKeys.length).toBe(66);
  });

  it('should have sequential numeric values starting from 1', () => {
    // Verify that enum values are sequential
    const keys = Object.keys(TypeIdentifierEnum).filter(k => isNaN(Number(k)));
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = TypeIdentifierEnum[key as keyof typeof TypeIdentifierEnum];
      
      if (typeof value === 'number') {
        expect(value).toBe(i + 1);
      }
    }
  });

  it('should have bidirectional mapping for all numeric enums', () => {
    // Test all reverse mappings
    const enumValues = Object.values(TypeIdentifierEnum).filter(v => typeof v === 'number') as number[];
    
    enumValues.forEach(value => {
      const key = TypeIdentifierEnum[value];
      expect(key).toBeDefined();
      expect(TypeIdentifierEnum[key as keyof typeof TypeIdentifierEnum]).toBe(value);
    });
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processTypeIdentifier(typeId: TypeIdentifierEnum): string {
      return `Processing type identifier: ${typeId}`;
    }

    const result = processTypeIdentifier(TypeIdentifierEnum.cBroadcastStateReq);
    expect(result).toBe('Processing type identifier: 7');
  });

  it('should be usable in a switch statement', () => {
    function getTypeDescription(typeId: TypeIdentifierEnum): string {
      switch (typeId) {
        case TypeIdentifierEnum.cApoptosisProposalReq:
          return 'Apoptosis proposal request';
        case TypeIdentifierEnum.cBroadcastStateReq:
          return 'Broadcast state request';
        case TypeIdentifierEnum.cGetAccountDataReq:
          return 'Get account data request';
        default:
          return 'Unknown type identifier';
      }
    }

    expect(getTypeDescription(TypeIdentifierEnum.cApoptosisProposalReq)).toBe('Apoptosis proposal request');
    expect(getTypeDescription(TypeIdentifierEnum.cBroadcastStateReq)).toBe('Broadcast state request');
    expect(getTypeDescription(TypeIdentifierEnum.cGetAccountDataReq)).toBe('Get account data request');
    expect(getTypeDescription(TypeIdentifierEnum.cWrappedReq)).toBe('Unknown type identifier');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    expect(TypeIdentifierEnum.NonExistentType).toBeUndefined();
    expect(TypeIdentifierEnum[100]).toBeUndefined();
  });

  it('should handle type checking correctly', () => {
    // Get the actual highest value in the enum
    const enumValues = Object.values(TypeIdentifierEnum).filter(v => typeof v === 'number') as number[];
    const highestValue = Math.max(...enumValues);
    
    function isTypeIdentifier(value: unknown): value is TypeIdentifierEnum {
      return typeof value === 'number' && 
             Object.values(TypeIdentifierEnum).includes(value as TypeIdentifierEnum) &&
             value >= 1 && value <= highestValue;
    }

    // Positive cases
    expect(isTypeIdentifier(TypeIdentifierEnum.cApoptosisProposalReq)).toBe(true);
    expect(isTypeIdentifier(1)).toBe(true);
    expect(isTypeIdentifier(TypeIdentifierEnum.cProposalVersion)).toBe(true);
    
    // Negative cases
    expect(isTypeIdentifier(0)).toBe(false);
    expect(isTypeIdentifier(highestValue + 1)).toBe(false);
    expect(isTypeIdentifier('cBroadcastStateReq')).toBe(false);
    expect(isTypeIdentifier(null)).toBe(false);
    expect(isTypeIdentifier(undefined)).toBe(false);
  });

  it('should group related types correctly', () => {
    // Test request/response pairs that are known to have sequential IDs
    const sequentialPairs = [
      ['cApoptosisProposalReq', 'cApoptosisProposalResp'],
      ['cWrappedReq', 'cWrappedResp'],
      ['cGetAccountDataWithQueueHintsReq', 'cGetAccountDataWithQueueHintsResp'],
      ['cGetAccountQueueCountReq', 'cGetAccountQueueCountResp'],
      ['cGetAccountDataByListReq', 'cGetAccountDataByListResp'],
      ['cGetAccountDataReq', 'cGetAccountDataResp'],
      ['cCompareCertReq', 'cCompareCertResp'],
      ['cGetTxTimestampReq', 'cGetTxTimestampResp'],
      ['cGetTrieHashesReq', 'cGetTrieHashesResp'],
      ['cGetAccountDataByHashesReq', 'cGetAccountDataByHashesResp'],
      ['cRequestStateForTxPostReq', 'cRequestStateForTxPostResp'],
      ['cGlobalAccountReportReq', 'cGlobalAccountReportResp'],
      ['cGetConfirmOrChallengeReq', 'cGetConfirmOrChallengeResp'],
      ['cSignAppDataReq', 'cSignAppDataResp'],
      ['cGetAccountTrieHashesReq', 'cGetAccountTrieHashesResp'],
      ['cGetCachedAppDataReq', 'cGetCachedAppDataResp'],
      ['cRequestTxAndStateReq', 'cRequestTxAndStateResp'],
      ['cRequestStateForTxReq', 'cRequestStateForTxResp'],
      ['cRequestReceiptForTxReq', 'cRequestReceiptForTxResp']
    ];

    sequentialPairs.forEach(([reqKey, respKey]) => {
      const reqValue = TypeIdentifierEnum[reqKey as keyof typeof TypeIdentifierEnum];
      const respValue = TypeIdentifierEnum[respKey as keyof typeof TypeIdentifierEnum];
      expect(reqValue + 1).toBe(respValue);
    });

    // Test specific non-sequential pairs
    const specificPairs: [keyof typeof TypeIdentifierEnum, keyof typeof TypeIdentifierEnum][] = [
      ['cGetAppliedVoteReq', 'cGetAppliedVoteResp']
    ];

    specificPairs.forEach(([reqKey, respKey]) => {
      // Just verify both exist, without assuming sequential values
      expect(TypeIdentifierEnum[reqKey]).toBeDefined();
      expect(TypeIdentifierEnum[respKey]).toBeDefined();
    });
  });

  it('should be usable for type mapping', () => {
    // Create a complete request-response mapping
    const requestResponseMap: Record<number, TypeIdentifierEnum> = {};
    
    // Add all request-response pairs to the map
    requestResponseMap[TypeIdentifierEnum.cApoptosisProposalReq] = TypeIdentifierEnum.cApoptosisProposalResp;
    requestResponseMap[TypeIdentifierEnum.cWrappedReq] = TypeIdentifierEnum.cWrappedResp;
    requestResponseMap[TypeIdentifierEnum.cGetAccountDataWithQueueHintsReq] = TypeIdentifierEnum.cGetAccountDataWithQueueHintsResp;
    requestResponseMap[TypeIdentifierEnum.cGetAccountQueueCountReq] = TypeIdentifierEnum.cGetAccountQueueCountResp;
    requestResponseMap[TypeIdentifierEnum.cGetAccountDataByListReq] = TypeIdentifierEnum.cGetAccountDataByListResp;
    requestResponseMap[TypeIdentifierEnum.cGetAccountDataReq] = TypeIdentifierEnum.cGetAccountDataResp;
    requestResponseMap[TypeIdentifierEnum.cCompareCertReq] = TypeIdentifierEnum.cCompareCertResp;
    requestResponseMap[TypeIdentifierEnum.cGetTxTimestampReq] = TypeIdentifierEnum.cGetTxTimestampResp;
    requestResponseMap[TypeIdentifierEnum.cGetTrieHashesReq] = TypeIdentifierEnum.cGetTrieHashesResp;
    requestResponseMap[TypeIdentifierEnum.cGetAccountDataByHashesReq] = TypeIdentifierEnum.cGetAccountDataByHashesResp;
    requestResponseMap[TypeIdentifierEnum.cRequestStateForTxPostReq] = TypeIdentifierEnum.cRequestStateForTxPostResp;
    requestResponseMap[TypeIdentifierEnum.cGlobalAccountReportReq] = TypeIdentifierEnum.cGlobalAccountReportResp;
    requestResponseMap[TypeIdentifierEnum.cGetConfirmOrChallengeReq] = TypeIdentifierEnum.cGetConfirmOrChallengeResp;
    requestResponseMap[TypeIdentifierEnum.cSignAppDataReq] = TypeIdentifierEnum.cSignAppDataResp;
    requestResponseMap[TypeIdentifierEnum.cGetAccountTrieHashesReq] = TypeIdentifierEnum.cGetAccountTrieHashesResp;
    requestResponseMap[TypeIdentifierEnum.cGetCachedAppDataReq] = TypeIdentifierEnum.cGetCachedAppDataResp;
    requestResponseMap[TypeIdentifierEnum.cRequestTxAndStateReq] = TypeIdentifierEnum.cRequestTxAndStateResp;
    requestResponseMap[TypeIdentifierEnum.cRequestStateForTxReq] = TypeIdentifierEnum.cRequestStateForTxResp;
    requestResponseMap[TypeIdentifierEnum.cRequestReceiptForTxReq] = TypeIdentifierEnum.cRequestReceiptForTxResp;
    requestResponseMap[TypeIdentifierEnum.cGetAppliedVoteReq] = TypeIdentifierEnum.cGetAppliedVoteResp;
    
    // Test function that uses the map
    function getResponseTypeForRequest(requestType: TypeIdentifierEnum): TypeIdentifierEnum | undefined {
      return requestResponseMap[requestType];
    }

    // Test a few mappings
    expect(getResponseTypeForRequest(TypeIdentifierEnum.cApoptosisProposalReq)).toBe(TypeIdentifierEnum.cApoptosisProposalResp);
    expect(getResponseTypeForRequest(TypeIdentifierEnum.cGetAccountDataReq)).toBe(TypeIdentifierEnum.cGetAccountDataResp);
    expect(getResponseTypeForRequest(TypeIdentifierEnum.cBroadcastStateReq)).toBeUndefined();
    
    // Test all mappings
    Object.entries(requestResponseMap).forEach(([reqValue, respValue]) => {
      expect(getResponseTypeForRequest(Number(reqValue))).toBe(respValue);
    });
  });
}); 