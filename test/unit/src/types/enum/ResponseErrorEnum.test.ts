import assert from 'assert';
import { ResponseErrorEnum } from '../../../../../src/types/enum/ResponseErrorEnum';

describe('ResponseErrorEnum', () => {
  it('should exist as an enum', () => {
    assert(ResponseErrorEnum !== undefined);
    assert(typeof ResponseErrorEnum === 'object');
  });

  it('should contain all expected enum values with correct numeric values', () => {
    // Test all enum values to ensure they exist and have correct values
    assert.strictEqual(ResponseErrorEnum.InternalError, 1);
    assert.strictEqual(ResponseErrorEnum.BadRequest, 2);
    assert.strictEqual(ResponseErrorEnum.Unauthorized, 3);
    assert.strictEqual(ResponseErrorEnum.Forbidden, 4);
    assert.strictEqual(ResponseErrorEnum.NotFound, 5);
  });

  it('should have sequential numeric values starting from 1', () => {
    // Verify that enum values are sequential
    const values = Object.values(ResponseErrorEnum).filter(v => typeof v === 'number');
    for (let i = 0; i < values.length; i++) {
      assert.strictEqual(values[i], i + 1);
    }
  });

  it('should have bidirectional mapping for numeric enums', () => {
    // Numeric enums in TypeScript have reverse mappings
    assert.strictEqual(ResponseErrorEnum[1], 'InternalError');
    assert.strictEqual(ResponseErrorEnum[2], 'BadRequest');
    assert.strictEqual(ResponseErrorEnum[3], 'Unauthorized');
    assert.strictEqual(ResponseErrorEnum[4], 'Forbidden');
    assert.strictEqual(ResponseErrorEnum[5], 'NotFound');
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function handleResponseError(error: ResponseErrorEnum): string {
      return `Response error code: ${error}`;
    }

    const result = handleResponseError(ResponseErrorEnum.BadRequest);
    assert.strictEqual(result, 'Response error code: 2');
  });

  it('should be usable in a switch statement', () => {
    function getErrorMessage(error: ResponseErrorEnum): string {
      switch (error) {
        case ResponseErrorEnum.InternalError:
          return 'Internal server error occurred';
        case ResponseErrorEnum.BadRequest:
          return 'Bad request';
        case ResponseErrorEnum.Unauthorized:
          return 'Unauthorized access';
        case ResponseErrorEnum.Forbidden:
          return 'Access forbidden';
        case ResponseErrorEnum.NotFound:
          return 'Resource not found';
        default:
          return 'Unknown error';
      }
    }

    assert.strictEqual(getErrorMessage(ResponseErrorEnum.InternalError), 'Internal server error occurred');
    assert.strictEqual(getErrorMessage(ResponseErrorEnum.BadRequest), 'Bad request');
    assert.strictEqual(getErrorMessage(ResponseErrorEnum.Unauthorized), 'Unauthorized access');
    assert.strictEqual(getErrorMessage(ResponseErrorEnum.Forbidden), 'Access forbidden');
    assert.strictEqual(getErrorMessage(ResponseErrorEnum.NotFound), 'Resource not found');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    assert.strictEqual(ResponseErrorEnum.NonExistentError, undefined);
    assert.strictEqual(ResponseErrorEnum[10], undefined);
  });

  it('should handle type checking correctly', () => {
    function isResponseError(value: unknown): value is ResponseErrorEnum {
      return typeof value === 'number' && 
             Object.values(ResponseErrorEnum).includes(value as ResponseErrorEnum) &&
             value >= 1 && value <= 5;
    }

    // Positive cases
    assert.strictEqual(isResponseError(ResponseErrorEnum.InternalError), true);
    assert.strictEqual(isResponseError(1), true);
    assert.strictEqual(isResponseError(5), true);
    
    // Negative cases
    assert.strictEqual(isResponseError(0), false);
    assert.strictEqual(isResponseError(6), false);
    assert.strictEqual(isResponseError('BadRequest'), false);
    assert.strictEqual(isResponseError(null), false);
    assert.strictEqual(isResponseError(undefined), false);
  });

  it('should map to HTTP status codes', () => {
    // Simulate a function that maps enum values to HTTP status codes
    function getHttpStatusCode(error: ResponseErrorEnum): number {
      const statusMap: Record<ResponseErrorEnum, number> = {
        [ResponseErrorEnum.InternalError]: 500,
        [ResponseErrorEnum.BadRequest]: 400,
        [ResponseErrorEnum.Unauthorized]: 401,
        [ResponseErrorEnum.Forbidden]: 403,
        [ResponseErrorEnum.NotFound]: 404
      };
      
      return statusMap[error];
    }

    assert.strictEqual(getHttpStatusCode(ResponseErrorEnum.InternalError), 500);
    assert.strictEqual(getHttpStatusCode(ResponseErrorEnum.BadRequest), 400);
    assert.strictEqual(getHttpStatusCode(ResponseErrorEnum.Unauthorized), 401);
    assert.strictEqual(getHttpStatusCode(ResponseErrorEnum.Forbidden), 403);
    assert.strictEqual(getHttpStatusCode(ResponseErrorEnum.NotFound), 404);
  });

  it('should be usable in error handling scenarios', () => {
    // Simulate an error response creation function
    function createErrorResponse(errorType: ResponseErrorEnum): { code: number; message: string } {
      const messages: Record<ResponseErrorEnum, string> = {
        [ResponseErrorEnum.InternalError]: 'An internal error occurred',
        [ResponseErrorEnum.BadRequest]: 'The request was malformed',
        [ResponseErrorEnum.Unauthorized]: 'Authentication required',
        [ResponseErrorEnum.Forbidden]: 'You do not have permission',
        [ResponseErrorEnum.NotFound]: 'The requested resource was not found'
      };
      
      return {
        code: errorType,
        message: messages[errorType]
      };
    }

    const response = createErrorResponse(ResponseErrorEnum.Forbidden);
    assert.strictEqual(response.code, 4);
    assert.strictEqual(response.message, 'You do not have permission');
  });
}); 