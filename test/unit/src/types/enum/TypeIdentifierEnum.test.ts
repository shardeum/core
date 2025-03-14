import assert from 'assert';
import { TypeIdentifierEnum } from '../../../../../src/types/enum/TypeIdentifierEnum';

describe('TypeIdentifierEnum', () => {
  it('should exist as an enum', () => {
    assert(TypeIdentifierEnum !== undefined);
    assert(typeof TypeIdentifierEnum === 'object');
  });

  it('should contain expected enum values with correct numeric values', () => {
    // Test a sample of enum values to ensure they exist and have correct values
    assert.strictEqual(TypeIdentifierEnum.cApoptosisProposalReq, 1);
    assert.strictEqual(TypeIdentifierEnum.cApoptosisProposalResp, 2);
    assert.strictEqual(TypeIdentifierEnum.cWrappedReq, 3);
    assert.strictEqual(TypeIdentifierEnum.cWrappedDataResponse, 5);
    assert.strictEqual(TypeIdentifierEnum.cBroadcastStateReq, 7);
    assert.strictEqual(TypeIdentifierEnum.cCachedAppData, 9);
    assert.strictEqual(TypeIdentifierEnum.cProposalVersion, 66);
  });

  it('should have sequential numeric values starting from 1', () => {
    // Verify that enum values are sequential
    const keys = Object.keys(TypeIdentifierEnum).filter(k => isNaN(Number(k)));
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = TypeIdentifierEnum[key as keyof typeof TypeIdentifierEnum];
      
      if (typeof value === 'number') {
        assert.strictEqual(value, i + 1, `Expected ${key} to have value ${i + 1}, but got ${value}`);
      }
    }
  });

  it('should have bidirectional mapping for numeric enums', () => {
    // Test a sample of reverse mappings
    assert.strictEqual(TypeIdentifierEnum[1], 'cApoptosisProposalReq');
    assert.strictEqual(TypeIdentifierEnum[7], 'cBroadcastStateReq');
    assert.strictEqual(TypeIdentifierEnum[20], 'cSyncTrieHashesReq');
    assert.strictEqual(TypeIdentifierEnum[48], 'cRequestStateForTxReq');
    assert.strictEqual(TypeIdentifierEnum[66], 'cProposalVersion');
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processTypeIdentifier(typeId: TypeIdentifierEnum): string {
      return `Processing type identifier: ${typeId}`;
    }

    const result = processTypeIdentifier(TypeIdentifierEnum.cBroadcastStateReq);
    assert.strictEqual(result, 'Processing type identifier: 7');
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

    assert.strictEqual(getTypeDescription(TypeIdentifierEnum.cApoptosisProposalReq), 'Apoptosis proposal request');
    assert.strictEqual(getTypeDescription(TypeIdentifierEnum.cBroadcastStateReq), 'Broadcast state request');
    assert.strictEqual(getTypeDescription(TypeIdentifierEnum.cGetAccountDataReq), 'Get account data request');
    assert.strictEqual(getTypeDescription(TypeIdentifierEnum.cWrappedReq), 'Unknown type identifier');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    assert.strictEqual(TypeIdentifierEnum.NonExistentType, undefined);
    assert.strictEqual(TypeIdentifierEnum[100], undefined);
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
    assert.strictEqual(isTypeIdentifier(TypeIdentifierEnum.cApoptosisProposalReq), true);
    assert.strictEqual(isTypeIdentifier(1), true);
    assert.strictEqual(isTypeIdentifier(TypeIdentifierEnum.cProposalVersion), true);
    
    // Negative cases
    assert.strictEqual(isTypeIdentifier(0), false);
    assert.strictEqual(isTypeIdentifier(highestValue + 1), false);
    assert.strictEqual(isTypeIdentifier('cBroadcastStateReq'), false);
    assert.strictEqual(isTypeIdentifier(null), false);
    assert.strictEqual(isTypeIdentifier(undefined), false);
  });

  it('should group related types correctly', () => {
    // Test that request/response pairs have sequential IDs
    assert.strictEqual(TypeIdentifierEnum.cApoptosisProposalReq + 1, TypeIdentifierEnum.cApoptosisProposalResp);
    assert.strictEqual(TypeIdentifierEnum.cWrappedReq + 1, TypeIdentifierEnum.cWrappedResp);
    assert.strictEqual(TypeIdentifierEnum.cGetAccountDataReq + 1, TypeIdentifierEnum.cGetAccountDataResp);
    assert.strictEqual(TypeIdentifierEnum.cCompareCertReq + 1, TypeIdentifierEnum.cCompareCertResp);
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

    assert.strictEqual(
      getResponseTypeForRequest(TypeIdentifierEnum.cApoptosisProposalReq),
      TypeIdentifierEnum.cApoptosisProposalResp
    );
    
    assert.strictEqual(
      getResponseTypeForRequest(TypeIdentifierEnum.cGetAccountDataReq),
      TypeIdentifierEnum.cGetAccountDataResp
    );
    
    assert.strictEqual(
      getResponseTypeForRequest(TypeIdentifierEnum.cBroadcastStateReq),
      undefined
    );
  });
}); 