import { RequestErrorEnum } from '../../../../../src/types/enum/RequestErrorEnum';

describe('RequestErrorEnum', () => {
  it('should exist as an enum', () => {
    expect(RequestErrorEnum).toBeDefined();
    expect(typeof RequestErrorEnum).toBe('object');
  });

  it('should contain all expected enum values', () => {
    // Test all enum values to ensure they exist and have correct values
    expect(RequestErrorEnum.InvalidRequest).toBe('invalid_request');
    expect(RequestErrorEnum.InvalidRequestType).toBe('invalid_request_type');
    expect(RequestErrorEnum.InvalidPayload).toBe('invalid_payload');
    expect(RequestErrorEnum.InvalidVerificationData).toBe('invalid_verification_data');
    expect(RequestErrorEnum.MissingVerificationData).toBe('missing_verification_data');
    expect(RequestErrorEnum.InvalidSender).toBe('invalid_sender');
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
      expect(RequestErrorEnum[enumKey]).toBe(expectedValue);
    });
  });

  it('should follow snake_case naming convention for values', () => {
    // Verify that all enum values follow snake_case naming convention
    Object.values(RequestErrorEnum).forEach(value => {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
    });
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function handleError(error: RequestErrorEnum): string {
      return `Error occurred: ${error}`;
    }

    const result = handleError(RequestErrorEnum.InvalidPayload);
    expect(result).toBe('Error occurred: invalid_payload');
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

    expect(getErrorMessage(RequestErrorEnum.InvalidRequest)).toBe('The request is invalid');
    expect(getErrorMessage(RequestErrorEnum.InvalidPayload)).toBe('The payload is invalid');
    expect(getErrorMessage(RequestErrorEnum.InvalidSender)).toBe('The sender is invalid');
    expect(getErrorMessage(RequestErrorEnum.InvalidVerificationData)).toBe('Unknown error');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    expect(RequestErrorEnum.NonExistentError).toBeUndefined();
    expect(RequestErrorEnum['UnknownError']).toBeUndefined();
  });

  it('should handle type checking correctly', () => {
    function isRequestError(value: unknown): value is RequestErrorEnum {
      return Object.values(RequestErrorEnum).includes(value as RequestErrorEnum);
    }

    // Positive cases
    expect(isRequestError(RequestErrorEnum.InvalidRequest)).toBe(true);
    expect(isRequestError('invalid_request')).toBe(true);
    
    // Negative cases
    expect(isRequestError('not_a_valid_error')).toBe(false);
    expect(isRequestError(123)).toBe(false);
    expect(isRequestError(null)).toBe(false);
    expect(isRequestError(undefined)).toBe(false);
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
    expect(response1.error).toBe('invalid_request');
    expect(response1.code).toBe(400);

    const response2 = createErrorResponse(RequestErrorEnum.InvalidSender);
    expect(response2.error).toBe('invalid_sender');
    expect(response2.code).toBe(403);

    const response3 = createErrorResponse(RequestErrorEnum.InvalidPayload);
    expect(response3.error).toBe('invalid_payload');
    expect(response3.code).toBe(422);
  });
}); 