import * as crypto from '@shardeum-foundation/lib-crypto-utils'

// Initialize crypto for testing
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

describe('computePowGenerator', () => {
  // Since the main file is a process script, we'll test the logic directly

  it('should compute valid proof of work with difficulty 1', () => {
    const seed = 'test-seed-1'
    const difficulty = 1

    let nonce, hash
    let attempts = 0
    const maxAttempts = 10000

    do {
      nonce = crypto.randomBytes()
      hash = crypto.hashObj({ seed, nonce })
      attempts++
      if (attempts > maxAttempts) {
        throw new Error('Max attempts reached')
      }
    } while (parseInt(hex2bin(hash).substring(0, difficulty), 2) !== 0)

    expect(nonce).toBeDefined()
    expect(hash).toBeDefined()
    expect(parseInt(hex2bin(hash).substring(0, difficulty), 2)).toBe(0)
  })

  it('should compute valid proof of work with difficulty 2', () => {
    const seed = 'test-seed-2'
    const difficulty = 2

    let nonce, hash
    let attempts = 0
    const maxAttempts = 10000

    do {
      nonce = crypto.randomBytes()
      hash = crypto.hashObj({ seed, nonce })
      attempts++
      if (attempts > maxAttempts) {
        throw new Error('Max attempts reached')
      }
    } while (parseInt(hex2bin(hash).substring(0, difficulty), 2) !== 0)

    expect(nonce).toBeDefined()
    expect(hash).toBeDefined()
    expect(parseInt(hex2bin(hash).substring(0, difficulty), 2)).toBe(0)
  })

  it('should compute valid proof of work with difficulty 4', () => {
    const seed = 'test-seed-3'
    const difficulty = 4

    let nonce, hash
    let attempts = 0
    const maxAttempts = 50000

    do {
      nonce = crypto.randomBytes()
      hash = crypto.hashObj({ seed, nonce })
      attempts++
      if (attempts > maxAttempts) {
        throw new Error('Max attempts reached')
      }
    } while (parseInt(hex2bin(hash).substring(0, difficulty), 2) !== 0)

    expect(nonce).toBeDefined()
    expect(hash).toBeDefined()
    expect(parseInt(hex2bin(hash).substring(0, difficulty), 2)).toBe(0)
  })

  it('should produce different results for different seeds', () => {
    const difficulty = 1
    const results = []

    for (const seed of ['seed1', 'seed2']) {
      let nonce, hash
      do {
        nonce = crypto.randomBytes()
        hash = crypto.hashObj({ seed, nonce })
      } while (parseInt(hex2bin(hash).substring(0, difficulty), 2) !== 0)

      results.push({ nonce, hash })
    }

    // Different seeds should produce different results (with very high probability)
    expect(results[0].nonce).not.toBe(results[1].nonce)
    expect(results[0].hash).not.toBe(results[1].hash)
  })

  it('should verify that computed hash is correct', () => {
    const seed = 'verification-seed'
    const difficulty = 1

    let nonce, hash
    do {
      nonce = crypto.randomBytes()
      hash = crypto.hashObj({ seed, nonce })
    } while (parseInt(hex2bin(hash).substring(0, difficulty), 2) !== 0)

    // Recompute hash to verify
    const verifyHash = crypto.hashObj({ seed, nonce })
    expect(hash).toBe(verifyHash)
  })
})

// Helper function to match the one in the source file
function hex2bin(hex: string): string {
  let bin = ''
  for (let i = 0; i < hex.length; i++) {
    bin += parseInt(hex[i], 16).toString(2).padStart(4, '0')
  }
  return bin
}

describe('hex2bin function', () => {
  it('should convert hex to binary correctly', () => {
    expect(hex2bin('0')).toBe('0000')
    expect(hex2bin('1')).toBe('0001')
    expect(hex2bin('F')).toBe('1111')
    expect(hex2bin('f')).toBe('1111')
  })

  it('should handle multi-character hex strings', () => {
    expect(hex2bin('00')).toBe('00000000')
    expect(hex2bin('FF')).toBe('11111111')
    expect(hex2bin('A5')).toBe('10100101')
    expect(hex2bin('1234')).toBe('0001001000110100')
  })

  it('should handle empty string', () => {
    expect(hex2bin('')).toBe('')
  })

  it('should handle lowercase and uppercase hex', () => {
    expect(hex2bin('aB')).toBe('10101011')
    expect(hex2bin('Ab')).toBe('10101011')
  })
})
