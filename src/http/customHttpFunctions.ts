import got, { Got } from 'got'
import { config } from '../p2p/Context'
import { ReadableStream } from 'stream/web'

export function customGot(maxBytes?: number): Got {
  return got.extend({
    handlers: [
      (options, next) => {
        const downloadLimit = maxBytes ?? config.p2p.maxResponseSize
        const promiseOrStream = next(options)

        // A destroy function that supports both promises and streams
        const destroy = (message: string): void => {
          if (options.isStream) {
            // Type the stream properly
            const stream = promiseOrStream as ReturnType<typeof got.stream>
            stream.destroy(new Error(message))
            return
          }

          // Type the promise properly
          const promise = promiseOrStream as ReturnType<typeof got> & {
            cancel: (reason: string) => void
          }
          promise.cancel(message)
        }

        if (typeof downloadLimit === 'number') {
          promiseOrStream.on('downloadProgress', (progress) => {
            if (progress.transferred > downloadLimit) {
              destroy(`Exceeded the download limit of ${downloadLimit} bytes`)
            }
          })
        }

        return promiseOrStream
      },
    ],
  })
}

/**
 * A custom fetch function with size limiting.
 * @param input URL or Request object.
 * @param init Optional fetch configuration.
 * @param maxBytes Maximum response size in bytes (default: config.p2p.maxResponseSize).
 * @returns A Response with a ReadableStream that enforces the download limit.
 */
export async function customFetch(
  input: string | Request | URL,
  init?: RequestInit,
  maxBytes?: number
): Promise<Response> {
  const downloadLimit = maxBytes ?? config.p2p.maxResponseSize
  const response = await fetch(input, init)

  // Check Content-Length header if available
  const contentLength = response.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > downloadLimit) {
    throw new Error(`Exceeded the download limit of ${downloadLimit} bytes`)
  }

  // If there's no body, just return the response
  if (!response.body) return response

  const reader = response.body.getReader()

  const stream = new ReadableStream({
    async start(controller) {
      let bytesReceived = 0

      try {
        const processChunk = async (): Promise<void> => {
          const { done, value } = await reader.read()

          if (done) {
            controller.close()
            return
          }

          bytesReceived += value.length

          if (bytesReceived > downloadLimit) {
            const error = new Error(`Exceeded the download limit of ${downloadLimit} bytes`)
            controller.error(error)
            await reader.cancel(error)
            return
          }

          controller.enqueue(value)
          await processChunk() // Process next chunk with tail recursion
        }

        await processChunk() // Start processing
      } catch (error) {
        controller.error(error)
        await reader.cancel(error)
      }
    },
  })

  return new Response(stream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}
