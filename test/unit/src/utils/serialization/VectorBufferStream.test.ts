import { VectorBufferStream } from '../../../../../src/utils/serialization/VectorBufferStream'
import { strict as assert } from 'assert'

describe('VectorBufferStream', () => {
  describe('constructor', () => {
    it('should initialize with the given size', () => {
      const stream = new VectorBufferStream(100)
      assert.equal(stream.getBufferLength(), 100)
    })
  })

  describe('fromBuffer', () => {
    it('should create a stream from an existing buffer', () => {
      const buffer = Buffer.from([1, 2, 3, 4])
      const stream = VectorBufferStream.fromBuffer(buffer)
      assert.equal(stream.getBufferLength(), 4)
      stream.writeUInt8(5)
      assert.deepEqual(stream.getBuffer(), Buffer.from([5]))
      assert.deepEqual((stream as any).buffer, buffer)
    })
  })

  describe('getAsHexString', () => {
    it('should return the buffer as a hex string', () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04])
      const stream = VectorBufferStream.fromBuffer(buffer)
      assert.equal(stream.getAsHexString(), '01020304')
    })
  })

  describe('isAtOrPastEnd', () => {
    it('should return true when position is at the end', () => {
      const stream = new VectorBufferStream(4)
      stream.position = 4
      assert.equal(stream.isAtOrPastEnd(), true)
    })

    it('should return true when position is past the end', () => {
      const stream = new VectorBufferStream(4)
      stream.position = 5
      assert.equal(stream.isAtOrPastEnd(), true)
    })

    it('should return false when position is before the end', () => {
      const stream = new VectorBufferStream(4)
      stream.position = 3
      assert.equal(stream.isAtOrPastEnd(), false)
    })
  })

  describe('ensureCapacity', () => {
    it('should expand the buffer when needed', () => {
      const stream = new VectorBufferStream(4)
      // Access the private method through any type assertion
      const ensureCapacity = (stream as any).ensureCapacity.bind(stream)

      const initialLength = stream.getBufferLength()

      // The buffer doubles in size when expanded, so we need to request
      // more than the current size to trigger expansion
      ensureCapacity(5)

      // After expansion, the buffer should be at least double the original size
      assert.ok(stream.getBufferLength() >= initialLength * 2)
    })
  })

  describe('write methods', () => {
    it('should write string data', () => {
      const stream = new VectorBufferStream(10)
      stream.write('test')
      assert.equal(stream.position, 4)
      assert.equal(stream.getBuffer().toString(), 'test')
    })

    it('should write buffer data', () => {
      const stream = new VectorBufferStream(10)
      const data = Buffer.from([1, 2, 3, 4])
      stream.write(data)
      assert.equal(stream.position, 4)
      assert.deepEqual(stream.getBuffer(), data)
    })

    it('should write numeric types correctly', () => {
      const stream = new VectorBufferStream(50)

      stream.writeInt8(-42)
      stream.writeUInt8(42)
      stream.writeInt16(-1000)
      stream.writeUInt16(1000)
      stream.writeInt32(-100000)
      stream.writeUInt32(100000)
      stream.writeBigInt64(BigInt('-9223372036854775808'))
      stream.writeBigUInt64(BigInt('9223372036854775808'))
      stream.writeFloat(3.14)
      stream.writeDouble(3.14159265359)

      // Reset position to read back values
      stream.position = 0

      assert.equal(stream.readUInt8(), 214) // -42 in two's complement
      assert.equal(stream.readUInt8(), 42)
      assert.equal(stream.readInt16(), -1000)
      assert.equal(stream.readUInt16(), 1000)
      assert.equal(stream.readInt32(), -100000)
      assert.equal(stream.readUInt32(), 100000)
      assert.equal(stream.readBigInt64(), BigInt('-9223372036854775808'))
      assert.equal(stream.readBigUInt64(), BigInt('9223372036854775808'))
      assert.ok(Math.abs(stream.readFloat() - 3.14) < 0.001) // Float has limited precision
      assert.ok(Math.abs(stream.readDouble() - 3.14159265359) < 0.0000000001)
    })
  })

  describe('string and buffer methods', () => {
    it('should write and read strings correctly', () => {
      const stream = new VectorBufferStream(100)
      const testString = 'Hello, world!'

      stream.writeString(testString)
      stream.position = 0

      const readString = stream.readString()
      assert.equal(readString, testString)
    })

    it('should write and read buffers correctly', () => {
      const stream = new VectorBufferStream(100)
      const testBuffer = Buffer.from([1, 2, 3, 4, 5])

      stream.writeBuffer(testBuffer)
      stream.position = 0

      const readBuffer = stream.readBuffer()
      assert.deepEqual(readBuffer, testBuffer)
    })

    it('should write and read fixed buffers correctly', () => {
      const stream = new VectorBufferStream(100)
      const testBuffer = Buffer.from([1, 2, 3, 4, 5])

      stream.writeFixedBuffer(testBuffer)
      stream.position = 0

      const readBuffer = stream.readFixedBuffer(5)
      assert.deepEqual(readBuffer, testBuffer)
    })
  })

  describe('complex operations', () => {
    it('should handle mixed read/write operations', () => {
      const stream = new VectorBufferStream(100)

      // Write various data types
      stream.writeUInt32(42)
      stream.writeString('test string')
      stream.writeBuffer(Buffer.from([1, 2, 3]))

      // Reset position to read
      stream.position = 0

      // Read back in same order
      const num = stream.readUInt32()
      const str = stream.readString()
      const buf = stream.readBuffer()

      assert.equal(num, 42)
      assert.equal(str, 'test string')
      assert.deepEqual(buf, Buffer.from([1, 2, 3]))
    })

    it('should handle buffer expansion during writes', () => {
      // Start with a small buffer
      const stream = new VectorBufferStream(10)

      // Write data larger than initial capacity
      const largeString = 'a'.repeat(100)
      stream.writeString(largeString)

      // Verify the buffer expanded and data was written correctly
      assert.ok(stream.getBufferLength() >= 104) // 4 bytes for length + 100 bytes for string

      // Read back the data
      stream.position = 0
      const readString = stream.readString()
      assert.equal(readString, largeString)
    })
  })
})
