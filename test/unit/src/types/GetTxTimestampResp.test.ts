import { Utils } from '@shardus/types';
import { VectorBufferStream } from '../../../../src';
import { deserializeGetTxTimestampResp, getTxTimestampResp, serializeGetTxTimestampResp, } from '../../../../src/types/GetTxTimestampResp';
import { initAjvSchemas } from '../../../../src/types/ajv/Helpers';
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum';
describe('getTxTimestampResp Serialization and Deserialization', () => {
    beforeAll(() => {
        initAjvSchemas();
    });
    describe('Serialization', () => {
        describe('Data validation Cases', () => {
            const invalidObjects = [
                {
                    description: "null 'txId'",
                    data: { txId: null, cycleMarker: '456', cycleCounter: 789, timestamp: 101112 },
                },
                {
                    description: "null 'cycleMarker'",
                    data: { txId: '123', cycleMarker: null, cycleCounter: 789, timestamp: 101112 },
                },
                {
                    description: "null 'cycleCounter'",
                    data: { txId: '123', cycleMarker: '456', cycleCounter: null, timestamp: 101112 },
                },
                {
                    description: "null 'timestamp'",
                    data: { txId: '123', cycleMarker: '456', cycleCounter: 789, timestamp: null },
                },
            ];
            test.each(invalidObjects)('should throw error if field is improper during serialization', ({ data }) => {
                const dataClone = Utils.safeJsonParse(Utils.safeStringify(data));
                const stream = new VectorBufferStream(0);
                expect(() => serializeGetTxTimestampResp(stream, dataClone)).toThrow('Data validation error');
            });
        });
        test('should serialize data correctly', () => {
            const obj: getTxTimestampResp = {
                txId: '123',
                cycleMarker: '456',
                cycleCounter: 789,
                timestamp: 101112,
                sign: { owner: 'owner123', sig: 'signature123' },
                isResponse: true,
            };
            const stream = new VectorBufferStream(0);
            serializeGetTxTimestampResp(stream, obj, true);
            const expectedStream = new VectorBufferStream(0);
            expectedStream.writeUInt16(TypeIdentifierEnum.cGetTxTimestampResp);
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.txId);
            expectedStream.writeString(obj.cycleMarker);
            expectedStream.writeUInt32(obj.cycleCounter);
            expectedStream.writeBigUInt64(BigInt(obj.timestamp));
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.sign?.owner ?? '');
            expectedStream.writeString(obj.sign?.sig ?? '');
            expectedStream.writeUInt8(1);
            expectedStream.writeUInt8(obj.isResponse ? 1 : 0);
            expect(stream.getBuffer()).toEqual(expectedStream.getBuffer());
        });
        test('should serialize data correctly with root true', () => {
            const stream = new VectorBufferStream(0);
            const obj: getTxTimestampResp = {
                txId: 'test123',
                cycleMarker: 'marker456',
                cycleCounter: 7890,
                timestamp: 123456,
                sign: { owner: 'owner789', sig: 'signature012' },
                isResponse: true,
            };
            serializeGetTxTimestampResp(stream, obj, true);
            const expectedStream = new VectorBufferStream(0);
            expectedStream.writeUInt16(TypeIdentifierEnum.cGetTxTimestampResp);
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.txId);
            expectedStream.writeString(obj.cycleMarker);
            expectedStream.writeUInt32(obj.cycleCounter);
            expectedStream.writeBigUInt64(BigInt(obj.timestamp));
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.sign?.owner ?? '');
            expectedStream.writeString(obj.sign?.sig ?? '');
            expectedStream.writeUInt8(1);
            expectedStream.writeUInt8(obj.isResponse ? 1 : 0);
            expect(stream.getBuffer()).toEqual(expectedStream.getBuffer());
        });
        test('should serialize data correctly with root false', () => {
            const stream = new VectorBufferStream(0);
            const obj: getTxTimestampResp = {
                txId: 'test123',
                cycleMarker: 'marker456',
                cycleCounter: 7890,
                timestamp: 123456,
                sign: { owner: 'owner789', sig: 'signature012' },
                isResponse: true,
            };
            serializeGetTxTimestampResp(stream, obj, false);
            const expectedStream = new VectorBufferStream(0);
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.txId);
            expectedStream.writeString(obj.cycleMarker);
            expectedStream.writeUInt32(obj.cycleCounter);
            expectedStream.writeBigUInt64(BigInt(obj.timestamp));
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.sign?.owner ?? '');
            expectedStream.writeString(obj.sign?.sig ?? '');
            expectedStream.writeUInt8(1);
            expectedStream.writeUInt8(obj.isResponse ? 1 : 0);
            expect(stream.getBuffer()).toEqual(expectedStream.getBuffer());
        });
        test('should serialize with empty string for txId and cycleMarker', () => {
            const obj: getTxTimestampResp = {
                txId: '',
                cycleMarker: '',
                cycleCounter: 1234,
                timestamp: 5678,
                sign: { owner: 'owner123', sig: 'signature123' },
                isResponse: true,
            };
            const stream = new VectorBufferStream(0);
            serializeGetTxTimestampResp(stream, obj, false);
            const expectedStream = new VectorBufferStream(0);
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.txId);
            expectedStream.writeString(obj.cycleMarker);
            expectedStream.writeUInt32(obj.cycleCounter);
            expectedStream.writeBigUInt64(BigInt(obj.timestamp));
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.sign?.owner ?? '');
            expectedStream.writeString(obj.sign?.sig ?? '');
            expectedStream.writeUInt8(1);
            expectedStream.writeUInt8(obj.isResponse ? 1 : 0);
            expect(stream.getBuffer()).toEqual(expectedStream.getBuffer());
        });
        test('should serialize data correctly without sign and isResponse', () => {
            const obj: getTxTimestampResp = {
                txId: '123',
                cycleMarker: '456',
                cycleCounter: 789,
                timestamp: 101112,
            };
            const stream = new VectorBufferStream(0);
            serializeGetTxTimestampResp(stream, obj, false);
            const expectedStream = new VectorBufferStream(0);
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.txId);
            expectedStream.writeString(obj.cycleMarker);
            expectedStream.writeUInt32(obj.cycleCounter);
            expectedStream.writeBigUInt64(BigInt(obj.timestamp));
            expectedStream.writeUInt8(0);
            expectedStream.writeUInt8(0);
            expect(stream.getBuffer()).toEqual(expectedStream.getBuffer());
        });
        test('should serialize with large integers', () => {
            const obj: getTxTimestampResp = {
                txId: 'test',
                cycleMarker: 'marker',
                cycleCounter: 2147483647,
                timestamp: 123456789012345,
                sign: { owner: 'owner123', sig: 'signature123' },
                isResponse: true,
            };
            const stream = new VectorBufferStream(0);
            serializeGetTxTimestampResp(stream, obj, false);
            const expectedStream = new VectorBufferStream(0);
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.txId);
            expectedStream.writeString(obj.cycleMarker);
            expectedStream.writeUInt32(obj.cycleCounter);
            expectedStream.writeBigUInt64(BigInt(obj.timestamp));
            expectedStream.writeUInt8(1);
            expectedStream.writeString(obj.sign?.owner ?? '');
            expectedStream.writeString(obj.sign?.sig ?? '');
            expectedStream.writeUInt8(1);
            expectedStream.writeUInt8(obj.isResponse ? 1 : 0);
            expect(stream.getBuffer()).toEqual(expectedStream.getBuffer());
        });
    });
    describe('Deserialization', () => {
        test('should deserialize data correctly', () => {
            const stream = new VectorBufferStream(0);
            stream.writeUInt8(1);
            stream.writeString('123');
            stream.writeString('456');
            stream.writeUInt32(789);
            stream.writeBigUInt64(BigInt(101112));
            stream.writeUInt8(1);
            stream.writeString('owner123');
            stream.writeString('signature123');
            stream.writeUInt8(1);
            stream.writeUInt8(1);
            stream.position = 0;
            const obj = deserializeGetTxTimestampResp(stream);
            expect(obj).toEqual({
                txId: '123',
                cycleMarker: '456',
                cycleCounter: 789,
                timestamp: 101112,
                sign: { owner: 'owner123', sig: 'signature123' },
                isResponse: true,
            });
        });
        test('should throw version mismatch error', () => {
            const stream = new VectorBufferStream(0);
            stream.writeUInt8(2);
            stream.writeString('123');
            stream.writeString('456');
            stream.writeUInt32(789);
            stream.writeBigUInt64(BigInt(101112));
            stream.writeUInt8(0);
            stream.writeUInt8(0);
            stream.position = 0;
            expect(() => deserializeGetTxTimestampResp(stream)).toThrow('GetTxTimestampRespVersion : Unsupported version');
        });
        test('should deserialize with empty string for txId and cycleMarker', () => {
            const stream = new VectorBufferStream(0);
            stream.writeUInt8(1);
            stream.writeString('');
            stream.writeString('');
            stream.writeUInt32(1234);
            stream.writeBigUInt64(BigInt(5678));
            stream.writeUInt8(0);
            stream.writeUInt8(0);
            stream.position = 0;
            const obj = deserializeGetTxTimestampResp(stream);
            expect(obj).toEqual({ txId: '', cycleMarker: '', cycleCounter: 1234, timestamp: 5678 });
        });
        test('should deserialize data correctly without sign and isResponse', () => {
            const stream = new VectorBufferStream(0);
            stream.writeUInt8(0);
            stream.writeString('123');
            stream.writeString('456');
            stream.writeUInt32(789);
            stream.writeBigUInt64(BigInt(101112));
            stream.writeUInt8(0);
            stream.writeUInt8(0);
            stream.position = 0;
            const obj = deserializeGetTxTimestampResp(stream);
            expect(obj).toEqual({
                txId: '123',
                cycleMarker: '456',
                cycleCounter: 789,
                timestamp: 101112,
            });
        });
        test('should deserialize with large integers', () => {
            const stream = new VectorBufferStream(0);
            stream.writeUInt8(1);
            stream.writeString('test');
            stream.writeString('marker');
            stream.writeUInt32(2147483647);
            stream.writeBigUInt64(BigInt(123456789012345));
            stream.writeUInt8(0);
            stream.writeUInt8(0);
            stream.position = 0;
            const obj = deserializeGetTxTimestampResp(stream);
            expect(obj).toEqual({
                txId: 'test',
                cycleMarker: 'marker',
                cycleCounter: 2147483647,
                timestamp: 123456789012345,
            });
        });
    });
    describe('GetTxTimestampResp Serialization and Deserialization Together', () => {
        it('should serialize and deserialize maintaining data integrity', () => {
            const obj: getTxTimestampResp = {
                txId: '123',
                cycleMarker: '456',
                cycleCounter: 789,
                timestamp: 101112,
                sign: { owner: 'owner123', sig: 'signature123' },
                isResponse: true,
            };
            const stream = new VectorBufferStream(0);
            serializeGetTxTimestampResp(stream, obj, false);
            stream.position = 0;
            const deserializedObj = deserializeGetTxTimestampResp(stream);
            expect(deserializedObj).toEqual(obj);
        });
    });
});