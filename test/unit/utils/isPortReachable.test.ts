import net from 'node:net'
import { isPortReachable } from '../../../src/utils/isPortReachable'

jest.mock('node:net')

describe('isPortReachable', () => {
  let mockSocket: any
  let connectCallback: (() => void) | undefined
  let errorHandler: (() => void) | undefined
  let timeoutHandler: (() => void) | undefined

  beforeEach(() => {
    jest.clearAllMocks()
    mockSocket = {
      setTimeout: jest.fn(),
      once: jest.fn((event: string, handler: any) => {
        if (event === 'error') errorHandler = handler
        if (event === 'timeout') timeoutHandler = handler
      }),
      connect: jest.fn((port: number, host: string, cb: () => void) => {
        connectCallback = cb
      }),
      end: jest.fn(),
      destroy: jest.fn()
    };

    (net.Socket as jest.MockedClass<typeof net.Socket>).mockImplementation(() => mockSocket)
  })

  describe('successful connection', () => {
    it('should return true when port is reachable', async () => {
      // Start the promise
      const promise = isPortReachable({ host: 'localhost', port: 8080 })
      
      // Simulate successful connection
      connectCallback!()
      
      const result = await promise
      
      expect(result).toBe(true)
      expect(mockSocket.connect).toHaveBeenCalledWith(8080, 'localhost', expect.any(Function))
      expect(mockSocket.end).toHaveBeenCalled()
      expect(mockSocket.destroy).not.toHaveBeenCalled()
    })

    it('should use default timeout of 1000ms', async () => {
      const promise = isPortReachable({ host: 'localhost', port: 8080 })
      connectCallback!()
      await promise

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(1000)
    })

    it('should use custom timeout when provided', async () => {
      const promise = isPortReachable({ host: 'localhost', port: 8080, timeout: 5000 })
      connectCallback!()
      await promise

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(5000)
    })
  })

  describe('connection failures', () => {
    it('should return false on socket error', async () => {
      const promise = isPortReachable({ host: 'localhost', port: 8080 })
      
      // Simulate error
      errorHandler!()
      
      const result = await promise
      
      expect(result).toBe(false)
      expect(mockSocket.destroy).toHaveBeenCalled()
      expect(mockSocket.end).not.toHaveBeenCalled()
    })

    it('should return false on timeout', async () => {
      const promise = isPortReachable({ host: 'localhost', port: 8080, timeout: 500 })
      
      // Simulate timeout
      timeoutHandler!()
      
      const result = await promise
      
      expect(result).toBe(false)
      expect(mockSocket.destroy).toHaveBeenCalled()
      expect(mockSocket.end).not.toHaveBeenCalled()
    })

    it('should handle multiple error events gracefully', async () => {
      const promise = isPortReachable({ host: 'localhost', port: 8080 })
      
      // Simulate error
      errorHandler!()
      
      const result = await promise
      
      expect(result).toBe(false)
      expect(mockSocket.destroy).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle different host formats', async () => {
      const testCases = [
        { host: '127.0.0.1', port: 80 },
        { host: 'example.com', port: 443 },
        { host: 'localhost', port: 3000 },
        { host: '::1', port: 8080 } // IPv6
      ]

      for (const testCase of testCases) {
        mockSocket.connect.mockClear()
        
        const promise = isPortReachable(testCase)
        connectCallback!()
        await promise
        
        expect(mockSocket.connect).toHaveBeenCalledWith(testCase.port, testCase.host, expect.any(Function))
      }
    })

    it('should handle various port numbers', async () => {
      const testPorts = [1, 80, 443, 3000, 8080, 65535]

      for (const port of testPorts) {
        mockSocket.connect.mockClear()
        
        const promise = isPortReachable({ host: 'localhost', port })
        connectCallback!()
        await promise
        
        expect(mockSocket.connect).toHaveBeenCalledWith(port, 'localhost', expect.any(Function))
      }
    })

    it('should setup event handlers before connecting', () => {
      isPortReachable({ host: 'localhost', port: 8080 })

      // Verify setup order
      const setTimeoutOrder = mockSocket.setTimeout.mock.invocationCallOrder[0]
      const onceOrder = mockSocket.once.mock.invocationCallOrder[0]
      const connectOrder = mockSocket.connect.mock.invocationCallOrder[0]

      expect(setTimeoutOrder).toBeLessThan(connectOrder)
      expect(onceOrder).toBeLessThan(connectOrder)
    })

    it('should handle zero timeout gracefully', async () => {
      const promise = isPortReachable({ host: 'localhost', port: 8080, timeout: 0 })
      connectCallback!()
      await promise

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(0)
    })
  })

  describe('error handling', () => {
    it('should not throw when socket operations fail', async () => {
      mockSocket.connect.mockImplementation(() => {
        throw new Error('Connection failed')
      })

      await expect(isPortReachable({ host: 'localhost', port: 8080 })).resolves.toBe(false)
    })

    it('should complete successfully even if socket.end() throws', async () => {
      // Mock socket.end to throw but the promise should still resolve
      let endError: Error | undefined
      mockSocket.end.mockImplementation(() => {
        endError = new Error('End failed')
      })

      const promise = isPortReachable({ host: 'localhost', port: 8080 })
      connectCallback!()

      const result = await promise
      expect(result).toBe(true)
      expect(mockSocket.end).toHaveBeenCalled()
    })

    it('should return false even if socket.destroy() throws', async () => {
      // Mock socket.destroy to throw but the promise should still resolve
      let destroyError: Error | undefined
      mockSocket.destroy.mockImplementation(() => {
        destroyError = new Error('Destroy failed')
      })

      const promise = isPortReachable({ host: 'localhost', port: 8080 })
      errorHandler!()

      const result = await promise
      expect(result).toBe(false)
      expect(mockSocket.destroy).toHaveBeenCalled()
    })
  })
})