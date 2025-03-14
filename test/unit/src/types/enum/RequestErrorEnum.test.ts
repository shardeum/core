import assert from 'assert';
import { RequestErrorEnum } from '../../../../../src/types/enum/RequestErrorEnum';

describe('RequestErrorEnum', () => {
  it('should exist as an enum', () => {
    assert(RequestErrorEnum !== undefined);
    assert(typeof RequestErrorEnum === 'object');
  });

  it('should contain all expected enum values', () => {
    // Test all enum values to ensure they exist and have correct values
    assert.strictEqual(RequestErrorEnum.InvalidRequest, 'invalid_request');
    assert.strictEqual(RequestErrorEnum.InvalidRequestType, 'invalid_request_type');
    assert.strictEqual(RequestErrorEnum.InvalidPayload, 'invalid_payload');
    assert.strictEqual(RequestErrorEnum.InvalidVerificationData, 'invalid_verification_data');
    assert.strictEqual(RequestErrorEnum.MissingVerificationData, 'missing_verification_data');
    assert.strictEqual(RequestErrorEnum.InvalidSender, 'invalid_sender');
  });

  it('should have matching key-value pairs with expected format', () => {
    // Verify that each enum key matches its expected string value
    const expectedValues = {
      InvalidRequest: 'invalid_request',
      InvalidRequestType: 'invalid_request_type',
      InvalidPayload: 'invalid_payload',
      InvalidVerificationData: 'invalid_verification_data',
      MissingVerificationData: 'missing_verification_data',
      InvalidSender: 'invalid_sender'
    };

    Object.keys(expectedValues).forEach(key => {
      const enumKey = key as keyof typeof RequestErrorEnum;
      const expectedValue = expectedValues[key as keyof typeof expectedValues];
      assert.strictEqual(RequestErrorEnum[enumKey], expectedValue);
    });
  });

  it('should follow snake_case naming convention for values', () => {
    // Verify that all enum values follow snake_case naming convention
    Object.values(RequestErrorEnum).forEach(value => {
      assert.match(value, /^[a-z]+(_[a-z]+)*$/, `Value "${value}" should be in snake_case`);
    });
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function handleError(error: RequestErrorEnum): string {
      return `Error occurred: ${error}`;
    }

    const result = handleError(RequestErrorEnum.InvalidPayload);
    assert.strictEqual(result, 'Error occurred: invalid_payload');
  });

  it('should be usable in a switch statement', () => {
    function getErrorMessage(error: RequestErrorEnum): string {
      switch (error) {
        case RequestErrorEnum.InvalidRequest:
          return 'The request is invalid';
        case RequestErrorEnum.InvalidPayload:
          return 'The payload is invalid';
        case RequestErrorEnum.InvalidSender:
          return 'The sender is invalid';
        default:
          return 'Unknown error';
      }
    }

    assert.strictEqual(getErrorMessage(RequestErrorEnum.InvalidRequest), 'The request is invalid');
    assert.strictEqual(getErrorMessage(RequestErrorEnum.InvalidPayload), 'The payload is invalid');
    assert.strictEqual(getErrorMessage(RequestErrorEnum.InvalidSender), 'The sender is invalid');
    assert.strictEqual(getErrorMessage(RequestErrorEnum.InvalidVerificationData), 'Unknown error');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    assert.strictEqual(RequestErrorEnum.NonExistentError, undefined);
    assert.strictEqual(RequestErrorEnum['UnknownError'], undefined);
  });

  it('should handle type checking correctly', () => {
    function isRequestError(value: unknown): value is RequestErrorEnum {
      return Object.values(RequestErrorEnum).includes(value as RequestErrorEnum);
    }

    // Positive cases
    assert.strictEqual(isRequestError(RequestErrorEnum.InvalidRequest), true);
    assert.strictEqual(isRequestError('invalid_request'), true);
    
    // Negative cases
    assert.strictEqual(isRequestError('not_a_valid_error'), false);
    assert.strictEqual(isRequestError(123), false);
    assert.strictEqual(isRequestError(null), false);
    assert.strictEqual(isRequestError(undefined), false);
  });

  it('should be usable in error handling scenarios', () => {
    // Simulate an error handling function
    function createErrorResponse(errorType: RequestErrorEnum): { error: string; code: number } {
      return {
        error: errorType,
        code: errorType === RequestErrorEnum.InvalidRequest ? 400 : 
              errorType === RequestErrorEnum.InvalidSender ? 403 : 422
      };
    }

    const response1 = createErrorResponse(RequestErrorEnum.InvalidRequest);
    assert.strictEqual(response1.error, 'invalid_request');
    assert.strictEqual(response1.code, 400);

    const response2 = createErrorResponse(RequestErrorEnum.InvalidSender);
    assert.strictEqual(response2.error, 'invalid_sender');
    assert.strictEqual(response2.code, 403);

    const response3 = createErrorResponse(RequestErrorEnum.InvalidPayload);
    assert.strictEqual(response3.error, 'invalid_payload');
    assert.strictEqual(response3.code, 422);
  });
}); 