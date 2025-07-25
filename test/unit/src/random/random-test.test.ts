import { jest } from '@jest/globals'

// Mock console methods to capture output
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

describe('random-test', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    consoleLogSpy.mockClear()
  })

  afterAll(() => {
    consoleLogSpy.mockRestore()
  })

  it('should exist and be a valid TypeScript file', () => {
    // This test verifies that the file exists and can be parsed by TypeScript
    const fs = require('fs')
    const path = require('path')

    const filePath = path.join(__dirname, '../../../../src/random/random-test.ts')
    expect(fs.existsSync(filePath)).toBe(true)

    const fileContent = fs.readFileSync(filePath, 'utf8')
    expect(fileContent).toContain('import Random from')
    expect(fileContent).toContain('Random()')
    expect(fileContent).toContain('console.log')
  })

  it('should import and execute without syntax errors', () => {
    // Mock the Random module to prevent actual execution
    jest.doMock('../../../../src/random/index', () => {
      const mockRandom = {
        rand: jest.fn().mockReturnValue(0.5),
        randomInt: jest.fn().mockReturnValue(500),
      }
      const mockRandomConstructor = jest.fn().mockReturnValue(mockRandom)
      ;(mockRandomConstructor as any).generateSeed = jest.fn().mockReturnValue('abcd1234567890abcd1234567890abcd')
      return mockRandomConstructor
    })

    // This should not throw any syntax or import errors
    expect(() => {
      require('../../../../src/random/random-test')
    }).not.toThrow()
  })

  it('should demonstrate random functionality usage patterns', () => {
    const fs = require('fs')
    const path = require('path')

    const filePath = path.join(__dirname, '../../../../src/random/random-test.ts')
    const fileContent = fs.readFileSync(filePath, 'utf8')

    // Verify it demonstrates key Random module usage patterns
    expect(fileContent).toContain('random.rand()')
    expect(fileContent).toContain('random.randomInt(0, 1000)')
    expect(fileContent).toContain('Random.generateSeed()')
    expect(fileContent).toContain('Random(seed1)')
    expect(fileContent).toContain('Random(seed2)')
  })

  it('should contain proper console output statements', () => {
    const fs = require('fs')
    const path = require('path')

    const filePath = path.join(__dirname, '../../../../src/random/random-test.ts')
    const fileContent = fs.readFileSync(filePath, 'utf8')

    // Verify it contains informative console outputs
    expect(fileContent).toContain("Result of 'random.rand()'")
    expect(fileContent).toContain("Result of 'random.randomInt(0, 1000)'")
    expect(fileContent).toContain('Randomly generated seed:')
    expect(fileContent).toContain('Instance 1:')
    expect(fileContent).toContain('Instance 2:')
    expect(fileContent).toContain('Instance 3 (different seed):')
  })

  it('should demonstrate seeded random number generation', () => {
    const fs = require('fs')
    const path = require('path')

    const filePath = path.join(__dirname, '../../../../src/random/random-test.ts')
    const fileContent = fs.readFileSync(filePath, 'utf8')

    // Verify it properly demonstrates seeded randomization
    expect(fileContent).toContain('Random(seed1)')
    expect(fileContent).toContain('Random(seed2)')
    expect(fileContent).toMatch(/random1.*Random\(seed1\)/)
    expect(fileContent).toMatch(/random2.*Random\(seed1\)/)
    expect(fileContent).toMatch(/random3.*Random\(seed2\)/)
  })
})
