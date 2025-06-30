import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import { ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { Utils } from '@shardeum-foundation/lib-types'

// Mock all dependencies before importing
const mockCryptoLib = {
  init: jest.fn(),
  setCustomStringifier: jest.fn(),
  generateKeypair: jest.fn(),
  convertSkToCurve: jest.fn(),
  convertPkToCurve: jest.fn(),
  generateSharedKey: jest.fn(),
  tagObj: jest.fn(),
  signObj: jest.fn(),
  verifyObj: jest.fn(),
  authenticateObj: jest.fn(),
  createHash: jest.fn(),
  hash: jest.fn(),
  hashObj: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn()
}
jest.mock('@shardeum-foundation/lib-crypto-utils', () => mockCryptoLib)
jest.mock('child_process')
jest.mock('fs')
jest.mock('path')
jest.mock('../../../../src/logger')
jest.mock('../../../../src/storage', () => ({
  init: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  close: jest.fn()
}))
jest.mock('@shardeum-foundation/lib-types')
jest.mock('sqlite3', () => ({
  Database: jest.fn()
}))

// Import after mocking
import Crypto from '../../../../src/crypto/index'
import Logger from '../../../../src/logger'
import Storage from '../../../../src/storage'

const mockedCrypto = mockCryptoLib
const mockedFs = fs as jest.Mocked<typeof fs>
const mockedPath = path as jest.Mocked<typeof path>
const mockedUtils = Utils as jest.Mocked<typeof Utils>

describe('Crypto', () => {
  let cryptoInstance: Crypto
  let mockLogger: any
  let mockStorage: any
  let mockConfig: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup mock logger
    mockLogger = {
      getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn()
      })
    }

    // Setup mock storage
    mockStorage = {
      _checkInit: jest.fn(),
      getProperty: jest.fn(),
      setProperty: jest.fn()
    }

    // Setup mock config
    mockConfig = {
      crypto: {
        hashKey: 'test-hash-key',
        keyPairConfig: {
          useKeyPairFromFile: false,
          keyPairJsonFile: 'keypair.json'
        }
      }
    }

    // Mock crypto library functions
    mockedCrypto.init.mockImplementation(() => {})
    mockedCrypto.setCustomStringifier.mockImplementation(() => {})
    mockedCrypto.generateKeypair.mockReturnValue({
      publicKey: 'test-public-key',
      secretKey: 'test-secret-key'
    })
    mockedCrypto.convertSkToCurve.mockReturnValue('test-curve-secret-key')
    mockedCrypto.convertPkToCurve.mockReturnValue('test-curve-public-key')
    mockedCrypto.generateSharedKey.mockReturnValue(Buffer.from('shared-key'))
    mockedCrypto.tagObj.mockImplementation(() => {})
    mockedCrypto.signObj.mockImplementation((obj, sk, pk) => {
      ;(obj as any).sign = { owner: pk, sig: 'test-signature' }
      return obj as any
    })
    mockedCrypto.verifyObj.mockReturnValue(true)
    mockedCrypto.authenticateObj.mockReturnValue(true)
    mockedCrypto.hash.mockReturnValue('test-hash')
    mockedCrypto.hashObj.mockReturnValue('test-hash-obj')

    // Mock Utils functions
    mockedUtils.safeStringify.mockImplementation((obj) => JSON.stringify(obj))
    mockedUtils.safeJsonParse.mockImplementation((str) => JSON.parse(str))

    // Mock path operations
    mockedPath.join.mockImplementation((...paths) => paths.join('/'))

    // Mock fs operations
    mockedFs.existsSync.mockReturnValue(false)
    mockedFs.writeFileSync.mockImplementation(() => {})
    mockedFs.readFileSync.mockReturnValue(Buffer.from('{"publicKey":"test","secretKey":"test"}'))

    cryptoInstance = new Crypto('/test/base', mockConfig, mockLogger as Logger, mockStorage as Storage)
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(cryptoInstance.baseDir).toBe('/test/base')
      expect(cryptoInstance.config).toBe(mockConfig)
      expect(cryptoInstance.keypair).toEqual({})
      expect(cryptoInstance.curveKeypair).toEqual({})
      expect(cryptoInstance.powGenerators).toEqual({})
      expect(cryptoInstance.sharedKeys).toEqual({})
      expect(mockLogger.getLogger).toHaveBeenCalledWith('main')
    })
  })

  describe('init', () => {
    it('should initialize crypto library', async () => {
      mockStorage.getProperty.mockResolvedValue(null)
      
      await cryptoInstance.init()

      expect(mockedCrypto.init).toHaveBeenCalledWith('test-hash-key')
      expect(mockedCrypto.setCustomStringifier).toHaveBeenCalledWith(
        mockedUtils.safeStringify,
        'shardus_safeStringify'
      )
    })

    it('should load keypair from database if available', async () => {
      const savedKeypair = { publicKey: 'saved-public', secretKey: 'saved-secret' }
      mockStorage.getProperty.mockResolvedValue(savedKeypair)

      await cryptoInstance.init()

      expect(cryptoInstance.keypair).toEqual(savedKeypair)
      expect(mockedCrypto.convertSkToCurve).toHaveBeenCalledWith('saved-secret')
      expect(mockedCrypto.convertPkToCurve).toHaveBeenCalledWith('saved-public')
    })

    it('should load keypair from file if database is empty and file option is enabled', async () => {
      mockStorage.getProperty.mockResolvedValue(null)
      mockConfig.crypto.keyPairConfig.useKeyPairFromFile = true
      mockedFs.existsSync.mockReturnValue(true)
      
      jest.spyOn(cryptoInstance, 'readKeypairFromFile').mockReturnValue({
        publicKey: 'file-public',
        secretKey: 'file-secret'
      })

      await cryptoInstance.init()

      expect(cryptoInstance.keypair).toEqual({
        publicKey: 'file-public',
        secretKey: 'file-secret'
      })
    })

    it('should generate new keypair if none exists', async () => {
      mockStorage.getProperty.mockResolvedValue(null)
      
      await cryptoInstance.init()

      expect(mockedCrypto.generateKeypair).toHaveBeenCalled()
      expect(mockStorage.setProperty).toHaveBeenCalledWith('keypair', {
        publicKey: 'test-public-key',
        secretKey: 'test-secret-key'
      })
    })

    it('should handle database errors gracefully', async () => {
      mockStorage.getProperty.mockRejectedValue(new Error('Database error'))
      
      await cryptoInstance.init()

      expect(mockedCrypto.generateKeypair).toHaveBeenCalled()
    })
  })

  describe('setCurveKeyPair', () => {
    it('should set curve keypair from ed25519 keypair', () => {
      // Set up the instance keypair first since setCurveKeyPair uses this.keypair not the parameter
      cryptoInstance.keypair = { publicKey: 'ed-public', secretKey: 'ed-secret' }
      const keypair = { publicKey: 'ed-public', secretKey: 'ed-secret' }
      
      cryptoInstance.setCurveKeyPair(keypair)

      expect(mockedCrypto.convertSkToCurve).toHaveBeenCalledWith('ed-secret')
      expect(mockedCrypto.convertPkToCurve).toHaveBeenCalledWith('ed-public')
      expect(cryptoInstance.curveKeypair).toEqual({
        secretKey: 'test-curve-secret-key',
        publicKey: 'test-curve-public-key'
      })
    })

    it('should handle null keypair', () => {
      cryptoInstance.setCurveKeyPair(null)
      // Should not crash
    })
  })

  describe('getKeyPairFile', () => {
    it('should return correct file path', () => {
      const result = cryptoInstance.getKeyPairFile()
      
      expect(mockedPath.join).toHaveBeenCalledWith('/test/base', 'keypair.json')
      expect(result).toBe('/test/base/keypair.json')
    })
  })

  describe('writeKeypairToFile', () => {
    it('should write keypair to file', () => {
      const keypair = { publicKey: 'test-public', secretKey: 'test-secret' }
      jest.spyOn(cryptoInstance, 'getKeyPairFile').mockReturnValue('/test/keypair.json')
      
      cryptoInstance.writeKeypairToFile(keypair)

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/test/keypair.json',
        '{"publicKey":"test-public","secretKey":"test-secret"}'
      )
    })
  })

  describe('readKeypairFromFile', () => {
    it('should read keypair from file if exists', () => {
      mockedFs.existsSync.mockReturnValue(true)
      jest.spyOn(cryptoInstance, 'getKeyPairFile').mockReturnValue('/test/keypair.json')
      
      const result = cryptoInstance.readKeypairFromFile()

      expect(mockedFs.readFileSync).toHaveBeenCalledWith('/test/keypair.json')
      expect(result).toEqual({ publicKey: 'test', secretKey: 'test' })
    })

    it('should return null if file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false)
      
      const result = cryptoInstance.readKeypairFromFile()

      expect(result).toBeNull()
    })
  })

  describe('_generateKeypair', () => {
    it('should generate new keypair', () => {
      const result = cryptoInstance._generateKeypair()

      expect(mockedCrypto.generateKeypair).toHaveBeenCalled()
      expect(result).toEqual({
        publicKey: 'test-public-key',
        secretKey: 'test-secret-key'
      })
    })
  })

  describe('convertPublicKeyToCurve', () => {
    it('should convert public key to curve format', () => {
      const result = cryptoInstance.convertPublicKeyToCurve('ed-public-key')

      expect(mockedCrypto.convertPkToCurve).toHaveBeenCalledWith('ed-public-key')
      expect(result).toBe('test-curve-public-key')
    })
  })

  describe('getPublicKey', () => {
    it('should return public key', () => {
      cryptoInstance.keypair = { publicKey: 'test-public-key' }
      
      const result = cryptoInstance.getPublicKey()

      expect(result).toBe('test-public-key')
    })
  })

  describe('getCurvePublicKey', () => {
    it('should return curve public key', () => {
      cryptoInstance.curveKeypair = { publicKey: 'test-curve-public-key' }
      
      const result = cryptoInstance.getCurvePublicKey()

      expect(result).toBe('test-curve-public-key')
    })
  })

  describe('getSharedKey', () => {
    beforeEach(() => {
      cryptoInstance.curveKeypair = { secretKey: 'test-curve-secret' }
    })

    it('should generate and cache shared key', () => {
      const result = cryptoInstance.getSharedKey('recipient-curve-pk')

      expect(mockedCrypto.generateSharedKey).toHaveBeenCalledWith(
        'test-curve-secret',
        'recipient-curve-pk'
      )
      expect(result).toEqual(Buffer.from('shared-key'))
      expect(cryptoInstance.sharedKeys['recipient-curve-pk']).toEqual(Buffer.from('shared-key'))
    })

    it('should return cached shared key', () => {
      const cachedKey = Buffer.from('cached-key')
      cryptoInstance.sharedKeys['recipient-curve-pk'] = cachedKey
      
      const result = cryptoInstance.getSharedKey('recipient-curve-pk')

      expect(mockedCrypto.generateSharedKey).not.toHaveBeenCalled()
      expect(result).toBe(cachedKey)
    })
  })

  describe('tag', () => {
    it('should tag object with shared key', () => {
      jest.spyOn(cryptoInstance, 'getSharedKey').mockReturnValue(Buffer.from('shared-key'))
      const obj = { data: 'test' }
      
      const result = cryptoInstance.tag(obj, 'recipient-curve-pk')

      expect(cryptoInstance.getSharedKey).toHaveBeenCalledWith('recipient-curve-pk')
      expect(mockedCrypto.tagObj).toHaveBeenCalledWith(
        { data: 'test' },
        Buffer.from('shared-key')
      )
      expect(result).toEqual({ data: 'test' })
    })
  })

  describe('tagWithSize', () => {
    it('should tag object with size and shared key', () => {
      jest.spyOn(cryptoInstance, 'getSharedKey').mockReturnValue(Buffer.from('shared-key'))
      const obj = { data: 'test' }
      
      const result = cryptoInstance.tagWithSize(obj, 'recipient-curve-pk')

      expect(result.msgSize).toBeGreaterThan(0)
      expect(cryptoInstance.getSharedKey).toHaveBeenCalledWith('recipient-curve-pk')
      expect(mockedCrypto.tagObj).toHaveBeenCalled()
    })
  })

  describe('signWithSize', () => {
    it('should sign object with message size', () => {
      cryptoInstance.keypair = { secretKey: 'test-secret', publicKey: 'test-public' }
      const obj = { data: 'test' }
      
      const result = cryptoInstance.signWithSize(obj)

      expect((obj as any).msgSize).toBeGreaterThan(0)
      expect(mockedCrypto.signObj).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'test',
          msgSize: expect.any(Number)
        }),
        'test-secret',
        'test-public'
      )
    })
  })

  describe('authenticate', () => {
    it('should authenticate tagged object', () => {
      jest.spyOn(cryptoInstance, 'getSharedKey').mockReturnValue(Buffer.from('shared-key'))
      const taggedObj = { data: 'test', tag: 'some-tag' } as any
      
      const result = cryptoInstance.authenticate(taggedObj, 'sender-curve-pk')

      expect(cryptoInstance.getSharedKey).toHaveBeenCalledWith('sender-curve-pk')
      expect(mockedCrypto.authenticateObj).toHaveBeenCalledWith(
        taggedObj,
        Buffer.from('shared-key')
      )
      expect(result).toBe(true)
    })
  })

  describe('sign', () => {
    it('should sign object', () => {
      cryptoInstance.keypair = { secretKey: 'test-secret', publicKey: 'test-public' }
      const obj = { data: 'test' }
      
      const result = cryptoInstance.sign(obj)

      expect(mockedCrypto.signObj).toHaveBeenCalledWith(
        expect.objectContaining({ data: 'test' }),
        'test-secret',
        'test-public'
      )
      expect(result).toEqual(expect.objectContaining({ 
        data: 'test',
        sign: expect.objectContaining({
          owner: 'test-public',
          sig: 'test-signature'
        })
      }))
    })
  })

  describe('verify', () => {
    it('should verify signed object', () => {
      const signedObj = { data: 'test', sign: { owner: 'test-owner' } } as any
      
      const result = cryptoInstance.verify(signedObj)

      expect(mockedCrypto.verifyObj).toHaveBeenCalledWith(signedObj)
      expect(result).toBe(true)
    })

    it('should verify with expected public key', () => {
      const signedObj = { data: 'test', sign: { owner: 'test-owner' } } as any
      
      const result = cryptoInstance.verify(signedObj, 'test-owner')

      expect(result).toBe(true)
    })

    it('should reject if expected public key does not match', () => {
      const signedObj = { data: 'test', sign: { owner: 'wrong-owner' } } as any
      
      const result = cryptoInstance.verify(signedObj, 'test-owner')

      expect(result).toBe(false)
    })

    it('should handle verification errors', () => {
      mockedCrypto.verifyObj.mockImplementation(() => {
        throw new Error('Verification error')
      })
      const signedObj = { data: 'test', sign: { owner: 'test-owner' } } as any
      
      const result = cryptoInstance.verify(signedObj)

      expect(result).toBe(false)
    })
  })

  describe('hash', () => {
    it('should hash string', () => {
      const result = cryptoInstance.hash('test-string')

      expect(mockedCrypto.hash).toHaveBeenCalledWith('test-string')
      expect(result).toBe('test-hash')
    })

    it('should hash object without signature', () => {
      const obj = { data: 'test' }
      
      const result = cryptoInstance.hash(obj)

      expect(mockedCrypto.hashObj).toHaveBeenCalledWith(obj)
      expect(result).toBe('test-hash-obj')
    })

    it('should hash object with signature', () => {
      const obj = { data: 'test', sign: { owner: 'test', sig: 'test-sig' } }
      
      const result = cryptoInstance.hash(obj)

      expect(mockedCrypto.hashObj).toHaveBeenCalledWith(obj, true)
      expect(result).toBe('test-hash-obj')
    })
  })

  describe('isGreaterHash', () => {
    it('should compare hashes correctly', () => {
      expect(cryptoInstance.isGreaterHash('b', 'a')).toBe(true)
      expect(cryptoInstance.isGreaterHash('a', 'b')).toBe(false)
      expect(cryptoInstance.isGreaterHash(2, 1)).toBe(true)
      expect(cryptoInstance.isGreaterHash(1, 2)).toBe(false)
    })
  })

  describe('getComputeProofOfWork', () => {
    it('should delegate to proof of work generator', async () => {
      jest.spyOn(cryptoInstance, '_runProofOfWorkGenerator').mockResolvedValue({ nonce: 123, hash: 'test-hash' })
      
      const result = await cryptoInstance.getComputeProofOfWork('test-seed', 4)

      expect(cryptoInstance._runProofOfWorkGenerator).toHaveBeenCalledWith(
        './computePowGenerator.js',
        'test-seed',
        4
      )
      expect(result).toEqual({ nonce: 123, hash: 'test-hash' })
    })
  })

  describe('stopAllGenerators', () => {
    it('should kill all running generators', () => {
      const mockProcess1 = { kill: jest.fn() }
      const mockProcess2 = { kill: jest.fn() }
      cryptoInstance.powGenerators = {
        'gen1': mockProcess1 as any,
        'gen2': mockProcess2 as any
      }
      
      cryptoInstance.stopAllGenerators()

      expect(mockProcess1.kill).toHaveBeenCalled()
      expect(mockProcess2.kill).toHaveBeenCalled()
      expect(cryptoInstance.powGenerators).toEqual({})
    })
  })
})