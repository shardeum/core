import { TypeIdentifierEnum } from '../../../../../src/types/enum/TypeIdentifierEnum';

describe('TypeIdentifierEnum', () => {
  it('should exist as an enum', () => {
    expect(TypeIdentifierEnum).toBeDefined();
    expect(typeof TypeIdentifierEnum).toBe('object');
  });

  it('should contain expected enum values with correct numeric values', () => {
    // Test a sample of enum values to ensure they exist and have correct values
    expect(TypeIdentifierEnum.cApoptosisProposalReq).toBe(1);
    expect(TypeIdentifierEnum.cApoptosisProposalResp).toBe(2);
    expect(TypeIdentifierEnum.cWrappedReq).toBe(3);
    expect(TypeIdentifierEnum.cWrappedDataResponse).toBe(5);
    expect(TypeIdentifierEnum.cBroadcastStateReq).toBe(7);
    expect(TypeIdentifierEnum.cCachedAppData).toBe(9);
    expect(TypeIdentifierEnum.cProposalVersion).toBe(66);
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

  it('should have bidirectional mapping for numeric enums', () => {
    // Test a sample of reverse mappings
    expect(TypeIdentifierEnum[1]).toBe('cApoptosisProposalReq');
    expect(TypeIdentifierEnum[7]).toBe('cBroadcastStateReq');
    expect(TypeIdentifierEnum[20]).toBe('cSyncTrieHashesReq');
    expect(TypeIdentifierEnum[48]).toBe('cRequestStateForTxReq');
    expect(TypeIdentifierEnum[66]).toBe('cProposalVersion');
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
    // Test that request/response pairs have sequential IDs
    expect(TypeIdentifierEnum.cApoptosisProposalReq + 1).toBe(TypeIdentifierEnum.cApoptosisProposalResp);
    expect(TypeIdentifierEnum.cWrappedReq + 1).toBe(TypeIdentifierEnum.cWrappedResp);
    expect(TypeIdentifierEnum.cGetAccountDataReq + 1).toBe(TypeIdentifierEnum.cGetAccountDataResp);
    expect(TypeIdentifierEnum.cCompareCertReq + 1).toBe(TypeIdentifierEnum.cCompareCertResp);
  });

  it('should be usable for type mapping', () => {
    // Simulate a type mapping function
    function getResponseTypeForRequest(requestType: TypeIdentifierEnum): TypeIdentifierEnum | undefined {
      const requestResponseMap: Record<number, TypeIdentifierEnum> = {
        [TypeIdentifierEnum.cApoptosisProposalReq]: TypeIdentifierEnum.cApoptosisProposalResp,
        [TypeIdentifierEnum.cWrappedReq]: TypeIdentifierEnum.cWrappedResp,
        [TypeIdentifierEnum.cGetAccountDataReq]: TypeIdentifierEnum.cGetAccountDataResp,
        [TypeIdentifierEnum.cCompareCertReq]: TypeIdentifierEnum.cCompareCertResp,
        [TypeIdentifierEnum.cGetTxTimestampReq]: TypeIdentifierEnum.cGetTxTimestampResp
      };
      
      return requestResponseMap[requestType];
    }

    expect(
      getResponseTypeForRequest(TypeIdentifierEnum.cApoptosisProposalReq)
    ).toBe(TypeIdentifierEnum.cApoptosisProposalResp);
    
    expect(
      getResponseTypeForRequest(TypeIdentifierEnum.cGetAccountDataReq)
    ).toBe(TypeIdentifierEnum.cGetAccountDataResp);
    
    expect(
      getResponseTypeForRequest(TypeIdentifierEnum.cBroadcastStateReq)
    ).toBeUndefined();
  });
}); 