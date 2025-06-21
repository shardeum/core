import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  LostArchiverInvestigateReq,
  serializeLostArchiverInvestigateReq,
  deserializeLostArchiverInvestigateReq,
} from '@src/types/LostArchiverInvestigateReq'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'

describe('LostArchiverInvestigateReq', () => {
  describe('serializeLostArchiverInvestigateReq', () => {
    it('should serialize with root=true correctly', () => {
      const obj: LostArchiverInvestigateReq = {
        type: 'investigate',
        target: 'target-node-id',
        investigator: 'investigator-node-id',
        sender: 'sender-node-id',
        cycle: 'cycle-123',
        sign: {
          owner: 'signer-public-key',
          sig: 'signature-data',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeLostArchiverInvestigateReq(stream, obj, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cLostArchiverInvestigateReq)
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('investigate')
      expect(readStream.readString()).toBe('target-node-id')
      expect(readStream.readString()).toBe('investigator-node-id')
      expect(readStream.readString()).toBe('sender-node-id')
      expect(readStream.readString()).toBe('cycle-123')
      expect(readStream.readString()).toBe('signer-public-key')
      expect(readStream.readString()).toBe('signature-data')
    })

    it('should serialize with root=false correctly', () => {
      const obj: LostArchiverInvestigateReq = {
        type: 'investigate',
        target: 'another-target',
        investigator: 'another-investigator',
        sender: 'another-sender',
        cycle: 'cycle-456',
        sign: {
          owner: 'another-owner',
          sig: 'another-sig',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeLostArchiverInvestigateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('investigate')
      expect(readStream.readString()).toBe('another-target')
      expect(readStream.readString()).toBe('another-investigator')
      expect(readStream.readString()).toBe('another-sender')
      expect(readStream.readString()).toBe('cycle-456')
      expect(readStream.readString()).toBe('another-owner')
      expect(readStream.readString()).toBe('another-sig')
    })

    it('should handle empty strings', () => {
      const obj: LostArchiverInvestigateReq = {
        type: 'investigate',
        target: '',
        investigator: '',
        sender: '',
        cycle: '',
        sign: {
          owner: '',
          sig: '',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeLostArchiverInvestigateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('investigate')
      expect(readStream.readString()).toBe('')
      expect(readStream.readString()).toBe('')
      expect(readStream.readString()).toBe('')
      expect(readStream.readString()).toBe('')
      expect(readStream.readString()).toBe('')
      expect(readStream.readString()).toBe('')
    })

    it('should handle special characters in strings', () => {
      const obj: LostArchiverInvestigateReq = {
        type: 'investigate',
        target: 'target-with-special-chars-!@#$%^&*()',
        investigator: 'investigator-with-unicode-😀🔥',
        sender: 'sender\nwith\tnewlines',
        cycle: 'cycle"with"quotes',
        sign: {
          owner: 'owner-with-spaces and symbols',
          sig: 'sig-with-backslash\\and/forward-slash',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeLostArchiverInvestigateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('investigate')
      expect(readStream.readString()).toBe('target-with-special-chars-!@#$%^&*()')
      expect(readStream.readString()).toBe('investigator-with-unicode-😀🔥')
      expect(readStream.readString()).toBe('sender\nwith\tnewlines')
      expect(readStream.readString()).toBe('cycle"with"quotes')
      expect(readStream.readString()).toBe('owner-with-spaces and symbols')
      expect(readStream.readString()).toBe('sig-with-backslash\\and/forward-slash')
    })

    it('should handle long strings', () => {
      const longString = 'a'.repeat(1000)
      const obj: LostArchiverInvestigateReq = {
        type: 'investigate',
        target: longString,
        investigator: longString,
        sender: longString,
        cycle: longString,
        sign: {
          owner: longString,
          sig: longString,
        },
      }

      const stream = new VectorBufferStream(0)
      serializeLostArchiverInvestigateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('investigate')
      expect(readStream.readString()).toBe(longString)
      expect(readStream.readString()).toBe(longString)
      expect(readStream.readString()).toBe(longString)
      expect(readStream.readString()).toBe(longString)
      expect(readStream.readString()).toBe(longString)
      expect(readStream.readString()).toBe(longString)
    })
  })

  describe('deserializeLostArchiverInvestigateReq', () => {
    it('should deserialize correctly', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('investigate')
      stream.writeString('target-node-id')
      stream.writeString('investigator-node-id')
      stream.writeString('sender-node-id')
      stream.writeString('cycle-123')
      stream.writeString('signer-public-key')
      stream.writeString('signature-data')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeLostArchiverInvestigateReq(readStream)

      expect(result).toEqual({
        type: 'investigate',
        target: 'target-node-id',
        investigator: 'investigator-node-id',
        sender: 'sender-node-id',
        cycle: 'cycle-123',
        sign: {
          owner: 'signer-public-key',
          sig: 'signature-data',
        },
      })
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(2) // wrong version
      stream.writeString('investigate')
      stream.writeString('target')
      stream.writeString('investigator')
      stream.writeString('sender')
      stream.writeString('cycle')
      stream.writeString('owner')
      stream.writeString('sig')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeLostArchiverInvestigateReq(readStream)).toThrow(
        'cLostArchiverInvestigateReq version mismatch'
      )
    })

    it('should throw error for unexpected type value', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('invalid-type') // wrong type
      stream.writeString('target')
      stream.writeString('investigator')
      stream.writeString('sender')
      stream.writeString('cycle')
      stream.writeString('owner')
      stream.writeString('sig')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeLostArchiverInvestigateReq(readStream)).toThrow(
        'Unexpected type value: invalid-type'
      )
    })

    it('should handle empty strings', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('investigate')
      stream.writeString('')
      stream.writeString('')
      stream.writeString('')
      stream.writeString('')
      stream.writeString('')
      stream.writeString('')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeLostArchiverInvestigateReq(readStream)

      expect(result).toEqual({
        type: 'investigate',
        target: '',
        investigator: '',
        sender: '',
        cycle: '',
        sign: {
          owner: '',
          sig: '',
        },
      })
    })

    it('should handle special characters in strings', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('investigate')
      stream.writeString('target-with-special-chars-!@#$%^&*()')
      stream.writeString('investigator-with-unicode-😀🔥')
      stream.writeString('sender\nwith\tnewlines')
      stream.writeString('cycle"with"quotes')
      stream.writeString('owner-with-spaces and symbols')
      stream.writeString('sig-with-backslash\\and/forward-slash')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeLostArchiverInvestigateReq(readStream)

      expect(result).toEqual({
        type: 'investigate',
        target: 'target-with-special-chars-!@#$%^&*()',
        investigator: 'investigator-with-unicode-😀🔥',
        sender: 'sender\nwith\tnewlines',
        cycle: 'cycle"with"quotes',
        sign: {
          owner: 'owner-with-spaces and symbols',
          sig: 'sig-with-backslash\\and/forward-slash',
        },
      })
    })

    it('should handle long strings', () => {
      const longString = 'a'.repeat(1000)
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('investigate')
      stream.writeString(longString)
      stream.writeString(longString)
      stream.writeString(longString)
      stream.writeString(longString)
      stream.writeString(longString)
      stream.writeString(longString)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeLostArchiverInvestigateReq(readStream)

      expect(result).toEqual({
        type: 'investigate',
        target: longString,
        investigator: longString,
        sender: longString,
        cycle: longString,
        sign: {
          owner: longString,
          sig: longString,
        },
      })
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should correctly serialize and deserialize', () => {
      const original: LostArchiverInvestigateReq = {
        type: 'investigate',
        target: 'round-trip-target',
        investigator: 'round-trip-investigator',
        sender: 'round-trip-sender',
        cycle: 'round-trip-cycle',
        sign: {
          owner: 'round-trip-owner',
          sig: 'round-trip-sig',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeLostArchiverInvestigateReq(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeLostArchiverInvestigateReq(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize with root=true', () => {
      const original: LostArchiverInvestigateReq = {
        type: 'investigate',
        target: 'root-round-trip-target',
        investigator: 'root-round-trip-investigator',
        sender: 'root-round-trip-sender',
        cycle: 'root-round-trip-cycle',
        sign: {
          owner: 'root-round-trip-owner',
          sig: 'root-round-trip-sig',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeLostArchiverInvestigateReq(stream, original, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cLostArchiverInvestigateReq)
      const deserialized = deserializeLostArchiverInvestigateReq(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should handle edge cases in round trip', () => {
      const edgeCases = [
        {
          type: 'investigate' as const,
          target: '',
          investigator: '',
          sender: '',
          cycle: '',
          sign: {
            owner: '',
            sig: '',
          },
        },
        {
          type: 'investigate' as const,
          target: 'special-chars-!@#$%^&*()',
          investigator: 'unicode-😀🔥',
          sender: 'newlines\nand\ttabs',
          cycle: 'quotes"and\'apostrophes',
          sign: {
            owner: 'spaces and symbols',
            sig: 'backslash\\and/forward-slash',
          },
        },
        {
          type: 'investigate' as const,
          target: 'a'.repeat(1000),
          investigator: 'b'.repeat(1000),
          sender: 'c'.repeat(1000),
          cycle: 'd'.repeat(1000),
          sign: {
            owner: 'e'.repeat(1000),
            sig: 'f'.repeat(1000),
          },
        },
      ]

      edgeCases.forEach((original, index) => {
        const stream = new VectorBufferStream(0)
        serializeLostArchiverInvestigateReq(stream, original, false)

        const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
        const deserialized = deserializeLostArchiverInvestigateReq(readStream)

        expect(deserialized).toEqual(original)
      })
    })
  })
})