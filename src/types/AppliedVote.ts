import { VectorBufferStream } from '../utils/serialization/VectorBufferStream';
import { SignSerializable, deserializeSign, serializeSign } from './Sign';
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum';
const cAppliedVoteVersion = 1;
export type AppliedVoteSerializable = {
    txid: string;
    transaction_result: boolean;
    account_id: string[];
    account_state_hash_after: string[];
    account_state_hash_before: string[];
    cant_apply: boolean;
    node_id: string;
    sign?: SignSerializable;
    app_data_hash?: string;
};
export function serializeAppliedVote(stream: VectorBufferStream, obj: AppliedVoteSerializable, root = false): void {
    if (root) {
        stream.writeUInt16(TypeIdentifierEnum.cAppliedVote);
    }
    stream.writeUInt8(cAppliedVoteVersion);
    stream.writeString(obj.txid);
    stream.writeUInt8(obj.transaction_result ? 1 : 0);
    stream.writeUInt16(obj.account_id.length);
    obj.account_id.forEach((id) => stream.writeString(id));
    stream.writeUInt16(obj.account_state_hash_after.length);
    obj.account_state_hash_after.forEach((hash) => stream.writeString(hash));
    stream.writeUInt16(obj.account_state_hash_before.length);
    obj.account_state_hash_before.forEach((hash) => stream.writeString(hash));
    stream.writeUInt8(obj.cant_apply ? 1 : 0);
    stream.writeString(obj.node_id);
    if (obj.sign) {
        stream.writeUInt8(1);
        serializeSign(stream, obj.sign);
    }
    else {
        stream.writeUInt8(0);
    }
    if (obj.app_data_hash) {
        stream.writeUInt8(1);
        stream.writeString(obj.app_data_hash);
    }
    else {
        stream.writeUInt8(0);
    }
}
export function deserializeAppliedVote(stream: VectorBufferStream): AppliedVoteSerializable {
    const version = stream.readUInt8();
    if (version > cAppliedVoteVersion) {
        throw new Error('AppliedVote version mismatch');
    }
    const txid = stream.readString();
    const transaction_result = stream.readUInt8() === 1;
    const account_id_length = stream.readUInt16();
    const account_id = new Array(account_id_length);
    for (let i = 0; i < account_id_length; i++) {
        account_id[i] = stream.readString();
    }
    const account_state_hash_after_length = stream.readUInt16();
    const account_state_hash_after = new Array(account_state_hash_after_length);
    for (let i = 0; i < account_state_hash_after_length; i++) {
        account_state_hash_after[i] = stream.readString();
    }
    const account_state_hash_before_length = stream.readUInt16();
    const account_state_hash_before = new Array(account_state_hash_before_length);
    for (let i = 0; i < account_state_hash_before_length; i++) {
        account_state_hash_before[i] = stream.readString();
    }
    const cant_apply = stream.readUInt8() === 1;
    const node_id = stream.readString();
    let sign;
    if (stream.readUInt8() === 1) {
        sign = deserializeSign(stream);
    }
    const isAppDataHashPresent = stream.readUInt8() === 1;
    let app_data_hash = null;
    if (isAppDataHashPresent) {
        app_data_hash = stream.readString();
    }
    const result: AppliedVoteSerializable = {
        txid,
        transaction_result,
        account_id,
        account_state_hash_after,
        account_state_hash_before,
        cant_apply,
        node_id,
    };
    if (sign) {
        result.sign = sign;
    }
    if (app_data_hash) {
        result.app_data_hash = app_data_hash;
    }
    return result;
}