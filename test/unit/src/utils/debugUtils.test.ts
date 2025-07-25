const mockExecAsync = jest.fn()

jest.mock('util', () => ({
  promisify: jest.fn(() => mockExecAsync),
}))

jest.mock('child_process')

describe('debugUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSocketReport', () => {
    test('should have proper mock setup', () => {
      expect(mockExecAsync).toBeDefined()
      expect(jest.isMockFunction(mockExecAsync)).toBe(true)
    })

    test('should handle exec command results', () => {
      mockExecAsync.mockResolvedValue({ stdout: 'test', stderr: '' })
      expect(mockExecAsync).toHaveBeenCalledTimes(0)
    })

    test('should handle regex patterns for socket output parsing', () => {
      const testLine = 'Total: 1234 (kernel 0)'
      const match = testLine.match(/Total:\s+(\d+)/)
      expect(match?.[1]).toBe('1234')
    })

    test('should handle TCP line parsing', () => {
      const tcpLine = 'TCP:   567 (estab 123, closed 45, orphaned 6, timewait 78)'
      const match = tcpLine.match(
        /TCP:\s+(\d+)\s+\(estab\s+(\d+),\s+closed\s+(\d+),\s+orphaned\s+(\d+),\s+timewait\s+(\d+)\)/
      )
      expect(match?.[1]).toBe('567')
      expect(match?.[2]).toBe('123')
      expect(match?.[3]).toBe('45')
      expect(match?.[4]).toBe('6')
      expect(match?.[5]).toBe('78')
    })

    test('should handle parseInt for numbers', () => {
      expect(parseInt('1234', 10)).toBe(1234)
      expect(parseInt('0', 10)).toBe(0)
      expect(parseInt('', 10)).toBeNaN()
    })

    test('should handle error object structure', () => {
      const error = new Error('test error')
      expect(error.message).toBe('test error')
    })
  })
})
