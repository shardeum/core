import {
  SignSerializable,
  serializeSign,
  deserializeSign,
  cSignVersion
} from '../../../src/types/Sign'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'

describe('Sign', () => {
  let mockStream: VectorBufferStream

  beforeEach(() => {
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn()
    } as unknown as VectorBufferStream
  })

  describe('cSignVersion', () => {
    it('should have correct version', () => {
      expect(cSignVersion).toBe(1)
    })
  })

  describe('serializeSign', () => {
    it('should serialize without root flag', () => {
      const sign: SignSerializable = {
        owner: 'owner-public-key-123',
        sig: 'signature-hash-456'
      }

      serializeSign(mockStream, sign, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cSignVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith('owner-public-key-123')
      expect(mockStream.writeString).toHaveBeenCalledWith('signature-hash-456')
      expect(mockStream.writeString).toHaveBeenCalledTimes(2)
    })

    it('should serialize with root flag', () => {
      const sign: SignSerializable = {
        owner: 'owner-key',
        sig: 'sig-hash'
      }

      serializeSign(mockStream, sign, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cSign)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cSignVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith('owner-key')
      expect(mockStream.writeString).toHaveBeenCalledWith('sig-hash')
    })

    it('should handle empty strings', () => {
      const sign: SignSerializable = {
        owner: '',
        sig: ''
      }

      serializeSign(mockStream, sign)

      expect(mockStream.writeString).toHaveBeenCalledWith('')
      expect(mockStream.writeString).toHaveBeenCalledTimes(2)
    })

    it('should handle long strings', () => {
      const longOwner = 'a'.repeat(1000)
      const longSig = 'b'.repeat(2000)
      const sign: SignSerializable = {
        owner: longOwner,
        sig: longSig
      }

      serializeSign(mockStream, sign)

      expect(mockStream.writeString).toHaveBeenCalledWith(longOwner)
      expect(mockStream.writeString).toHaveBeenCalledWith(longSig)
    })

    it('should handle special characters', () => {
      const sign: SignSerializable = {
        owner: 'owner-!@#$%^&*()_+-=[]{}|;:",.<>?',
        sig: 'sig-with-unicode-世界-🌍'
      }

      serializeSign(mockStream, sign)

      expect(mockStream.writeString).toHaveBeenCalledWith('owner-!@#$%^&*()_+-=[]{}|;:",.<>?')
      expect(mockStream.writeString).toHaveBeenCalledWith('sig-with-unicode-世界-🌍')
    })

    it('should maintain correct order of writes', () => {
      const sign: SignSerializable = {
        owner: 'test-owner',
        sig: 'test-sig'
      }

      serializeSign(mockStream, sign)

      const writeStringCalls = (mockStream.writeString as jest.Mock).mock.calls
      expect(writeStringCalls[0][0]).toBe('test-owner')
      expect(writeStringCalls[1][0]).toBe('test-sig')
    })
  })

  describe('deserializeSign', () => {
    it('should deserialize correctly', () => {
      const expectedOwner = 'owner-public-key-789'
      const expectedSig = 'signature-hash-012'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cSignVersion)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce(expectedOwner)
        .mockReturnValueOnce(expectedSig)

      const result = deserializeSign(mockStream)

      expect(result).toEqual({
        owner: expectedOwner,
        sig: expectedSig
      })
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(1)
      expect(mockStream.readString).toHaveBeenCalledTimes(2)
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cSignVersion + 1)

      expect(() => deserializeSign(mockStream)).toThrow('Sign version mismatch')
    })

    it('should handle empty strings', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cSignVersion)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')

      const result = deserializeSign(mockStream)

      expect(result).toEqual({
        owner: '',
        sig: ''
      })
    })

    it('should handle long strings', () => {
      const longOwner = 'x'.repeat(5000)
      const longSig = 'y'.repeat(10000)

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cSignVersion)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce(longOwner)
        .mockReturnValueOnce(longSig)

      const result = deserializeSign(mockStream)

      expect(result).toEqual({
        owner: longOwner,
        sig: longSig
      })
    })

    it('should handle special characters', () => {
      const specialOwner = 'owner-!@#$%^&*()_+-=[]{}|;:",.<>?'
      const specialSig = 'sig-with-unicode-世界-🌍'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cSignVersion)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce(specialOwner)
        .mockReturnValueOnce(specialSig)

      const result = deserializeSign(mockStream)

      expect(result).toEqual({
        owner: specialOwner,
        sig: specialSig
      })
    })

    it('should accept version 0', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(0)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('owner')
        .mockReturnValueOnce('sig')

      const result = deserializeSign(mockStream)

      expect(result).toEqual({
        owner: 'owner',
        sig: 'sig'
      })
    })

    it('should maintain correct order of reads', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cSignVersion)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('first-read')
        .mockReturnValueOnce('second-read')

      const result = deserializeSign(mockStream)

      expect(result.owner).toBe('first-read')
      expect(result.sig).toBe('second-read')
    })
  })
})