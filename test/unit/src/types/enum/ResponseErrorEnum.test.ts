import { ResponseErrorEnum } from '../../../../../src/types/enum/ResponseErrorEnum'

describe('ResponseErrorEnum', () => {
  it('should exist as an enum', () => {
    expect(ResponseErrorEnum).toBeDefined()
    expect(typeof ResponseErrorEnum).toBe('object')
  })

  it('should contain all expected enum values with correct numeric values', () => {
    // Test all enum values to ensure they exist and have correct values
    expect(ResponseErrorEnum.InternalError).toBe(1)
    expect(ResponseErrorEnum.BadRequest).toBe(2)
    expect(ResponseErrorEnum.Unauthorized).toBe(3)
    expect(ResponseErrorEnum.Forbidden).toBe(4)
    expect(ResponseErrorEnum.NotFound).toBe(5)
  })

  it('should have sequential numeric values starting from 1', () => {
    // Verify that enum values are sequential
    const values = Object.values(ResponseErrorEnum).filter((v) => typeof v === 'number')
    for (let i = 0; i < values.length; i++) {
      expect(values[i]).toBe(i + 1)
    }
  })

  it('should have bidirectional mapping for numeric enums', () => {
    // Numeric enums in TypeScript have reverse mappings
    expect(ResponseErrorEnum[1]).toBe('InternalError')
    expect(ResponseErrorEnum[2]).toBe('BadRequest')
    expect(ResponseErrorEnum[3]).toBe('Unauthorized')
    expect(ResponseErrorEnum[4]).toBe('Forbidden')
    expect(ResponseErrorEnum[5]).toBe('NotFound')
  })

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function handleResponseError(error: ResponseErrorEnum): string {
      return `Response error code: ${error}`
    }

    const result = handleResponseError(ResponseErrorEnum.BadRequest)
    expect(result).toBe('Response error code: 2')
  })

  it('should be usable in a switch statement', () => {
    function getErrorMessage(error: ResponseErrorEnum): string {
      switch (error) {
        case ResponseErrorEnum.InternalError:
          return 'Internal server error occurred'
        case ResponseErrorEnum.BadRequest:
          return 'Bad request'
        case ResponseErrorEnum.Unauthorized:
          return 'Unauthorized access'
        case ResponseErrorEnum.Forbidden:
          return 'Access forbidden'
        case ResponseErrorEnum.NotFound:
          return 'Resource not found'
        default:
          return 'Unknown error'
      }
    }

    expect(getErrorMessage(ResponseErrorEnum.InternalError)).toBe('Internal server error occurred')
    expect(getErrorMessage(ResponseErrorEnum.BadRequest)).toBe('Bad request')
    expect(getErrorMessage(ResponseErrorEnum.Unauthorized)).toBe('Unauthorized access')
    expect(getErrorMessage(ResponseErrorEnum.Forbidden)).toBe('Access forbidden')
    expect(getErrorMessage(ResponseErrorEnum.NotFound)).toBe('Resource not found')
  })

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    expect(ResponseErrorEnum.NonExistentError).toBeUndefined()
    expect(ResponseErrorEnum[10]).toBeUndefined()
  })

  it('should handle type checking correctly', () => {
    function isResponseError(value: unknown): value is ResponseErrorEnum {
      return (
        typeof value === 'number' &&
        Object.values(ResponseErrorEnum).includes(value as ResponseErrorEnum) &&
        value >= 1 &&
        value <= 5
      )
    }

    // Positive cases
    expect(isResponseError(ResponseErrorEnum.InternalError)).toBe(true)
    expect(isResponseError(1)).toBe(true)
    expect(isResponseError(5)).toBe(true)

    // Negative cases
    expect(isResponseError(0)).toBe(false)
    expect(isResponseError(6)).toBe(false)
    expect(isResponseError('BadRequest')).toBe(false)
    expect(isResponseError(null)).toBe(false)
    expect(isResponseError(undefined)).toBe(false)
  })

  it('should map to HTTP status codes', () => {
    // Simulate a function that maps enum values to HTTP status codes
    function getHttpStatusCode(error: ResponseErrorEnum): number {
      const statusMap: Record<ResponseErrorEnum, number> = {
        [ResponseErrorEnum.InternalError]: 500,
        [ResponseErrorEnum.BadRequest]: 400,
        [ResponseErrorEnum.Unauthorized]: 401,
        [ResponseErrorEnum.Forbidden]: 403,
        [ResponseErrorEnum.NotFound]: 404,
      }

      return statusMap[error]
    }

    expect(getHttpStatusCode(ResponseErrorEnum.InternalError)).toBe(500)
    expect(getHttpStatusCode(ResponseErrorEnum.BadRequest)).toBe(400)
    expect(getHttpStatusCode(ResponseErrorEnum.Unauthorized)).toBe(401)
    expect(getHttpStatusCode(ResponseErrorEnum.Forbidden)).toBe(403)
    expect(getHttpStatusCode(ResponseErrorEnum.NotFound)).toBe(404)
  })

  it('should be usable in error handling scenarios', () => {
    // Simulate an error response creation function
    function createErrorResponse(errorType: ResponseErrorEnum): { code: number; message: string } {
      const messages: Record<ResponseErrorEnum, string> = {
        [ResponseErrorEnum.InternalError]: 'An internal error occurred',
        [ResponseErrorEnum.BadRequest]: 'The request was malformed',
        [ResponseErrorEnum.Unauthorized]: 'Authentication required',
        [ResponseErrorEnum.Forbidden]: 'You do not have permission',
        [ResponseErrorEnum.NotFound]: 'The requested resource was not found',
      }

      return {
        code: errorType,
        message: messages[errorType],
      }
    }

    const response = createErrorResponse(ResponseErrorEnum.Forbidden)
    expect(response.code).toBe(4)
    expect(response.message).toBe('You do not have permission')
  })
})
