import { InternalBinaryHandler } from '../../../src/types/Handler'
import { AppHeader } from '@shardeum-foundation/lib-net/build/src/types'
import { Sign } from '../../../src/shardus/shardus-types'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'

describe('InternalBinaryHandler type', () => {
  it('should be a valid type declaration', () => {
    // This test ensures the type is importable
    const typeExists: InternalBinaryHandler = {} as InternalBinaryHandler
    expect(typeExists).toBeDefined()
  })

  it('should accept handler function with correct signature', () => {
    // Mock types
    const mockPayload = { data: 'test' }
    const mockResponse = { result: 'success' }
    const mockHeader: AppHeader = {} as AppHeader
    const mockSign: Sign = {} as Sign
    const mockSerializerFunc = (stream: VectorBufferStream, obj: any, root?: boolean) => {}

    // Mock respond function
    const mockRespond = jest.fn((
      response: typeof mockResponse,
      serializerFunc: (stream: VectorBufferStream, obj: typeof mockResponse, root?: boolean) => void,
      header?: AppHeader
    ) => {})

    // Create a handler that matches the type
    const handler: InternalBinaryHandler<typeof mockPayload, typeof mockResponse> = (
      payload,
      respond,
      header,
      sign
    ) => {
      expect(payload).toEqual(mockPayload)
      expect(header).toEqual(mockHeader)
      expect(sign).toEqual(mockSign)
      respond(mockResponse, mockSerializerFunc, mockHeader)
    }

    // Execute the handler
    handler(mockPayload, mockRespond, mockHeader, mockSign)

    // Verify respond was called
    expect(mockRespond).toHaveBeenCalledWith(mockResponse, mockSerializerFunc, mockHeader)
  })

  it('should work with default generic types', () => {
    const handler: InternalBinaryHandler = (payload, respond, header, sign) => {
      // Default types should be 'unknown'
      const p: unknown = payload
      const r: unknown = { data: 'test' }
      respond(r, jest.fn())
    }

    expect(handler).toBeDefined()
  })

  it('should enforce type constraints on payload and response', () => {
    interface TestPayload {
      id: number
      name: string
    }

    interface TestResponse {
      success: boolean
      message: string
    }

    const handler: InternalBinaryHandler<TestPayload, TestResponse> = (
      payload,
      respond,
      header,
      sign
    ) => {
      // TypeScript should enforce these types
      const id: number = payload.id
      const name: string = payload.name
      
      const response: TestResponse = {
        success: true,
        message: `Processed ${name} with id ${id}`
      }
      
      respond(response, jest.fn())
    }

    expect(handler).toBeDefined()
  })

  it('should allow optional header in respond function', () => {
    const handler: InternalBinaryHandler<any, any> = (payload, respond, header, sign) => {
      // Should be able to call respond without header
      respond({ data: 'test' }, jest.fn())
      
      // Should also be able to call with header
      respond({ data: 'test' }, jest.fn(), header)
    }

    expect(handler).toBeDefined()
  })
})