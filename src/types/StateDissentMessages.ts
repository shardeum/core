import { SignedReceiptRef, SignedReceipt } from '../state-manager/state-manager-types'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from './enum/TypeIdentifierEnum'
import { Utils } from '@shardeum-foundation/lib-types'
import { serializeSignedReceipt, deserializeSignedReceipt, SignedReceiptSerializable } from './SignedReceipt'

export interface StateBeforeDissentMessage {
  txid: string
  accountId: string
  observed: Array<{
    hash: string
    senderId: string
  }>
  proofReceipt?: SignedReceiptRef
  ts: number
}

export interface StateCorrectionMessage {
  accountId: string
  correctStateHash: string
  correctData?: any
  receiptRef: SignedReceiptRef
  receipt?: SignedReceipt
  ts: number
}

export interface StateDissentSeenSet {
  [key: string]: number // txid|accountId -> timestamp
}

const cStateBeforeDissentVersion = 1
const cStateCorrectionVersion = 1

export function serializeStateBeforeDissent(
  stream: VectorBufferStream,
  obj: StateBeforeDissentMessage,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cStateBeforeDissent)
  }
  stream.writeUInt8(cStateBeforeDissentVersion)
  stream.writeString(obj.txid)
  stream.writeString(obj.accountId)
  
  stream.writeUInt16(obj.observed.length)
  for (const obs of obj.observed) {
    stream.writeString(obs.hash)
    stream.writeString(obs.senderId)
  }
  
  stream.writeUInt8(obj.proofReceipt ? 1 : 0)
  if (obj.proofReceipt) {
    stream.writeString(obj.proofReceipt.receiptId)
    stream.writeString(obj.proofReceipt.txid)
    stream.writeUInt32(obj.proofReceipt.cycle)
    stream.writeBigUInt64(BigInt(obj.proofReceipt.timestamp))
  }
  
  stream.writeBigUInt64(BigInt(obj.ts))
}

export function deserializeStateBeforeDissent(stream: VectorBufferStream): StateBeforeDissentMessage {
  const version = stream.readUInt8()
  if (version > cStateBeforeDissentVersion) {
    throw new Error('StateBeforeDissent version mismatch')
  }
  
  const txid = stream.readString()
  const accountId = stream.readString()
  
  const observedLength = stream.readUInt16()
  const observed: Array<{ hash: string; senderId: string }> = []
  for (let i = 0; i < observedLength; i++) {
    observed.push({
      hash: stream.readString(),
      senderId: stream.readString()
    })
  }
  
  let proofReceipt: SignedReceiptRef | undefined
  const hasProofReceipt = stream.readUInt8()
  if (hasProofReceipt) {
    proofReceipt = {
      receiptId: stream.readString(),
      txid: stream.readString(),
      cycle: stream.readUInt32(),
      timestamp: Number(stream.readBigUInt64())
    }
  }
  
  const ts = Number(stream.readBigUInt64())
  
  return {
    txid,
    accountId,
    observed,
    proofReceipt,
    ts
  }
}

export function serializeStateCorrection(
  stream: VectorBufferStream,
  obj: StateCorrectionMessage,
  root = false
): void {
  if (root) {
    stream.writeUInt16(TypeIdentifierEnum.cStateCorrection)
  }
  stream.writeUInt8(cStateCorrectionVersion)
  stream.writeString(obj.accountId)
  stream.writeString(obj.correctStateHash)
  
  stream.writeUInt8(obj.correctData ? 1 : 0)
  if (obj.correctData) {
    stream.writeString(Utils.safeStringify(obj.correctData))
  }
  
  stream.writeString(obj.receiptRef.receiptId)
  stream.writeString(obj.receiptRef.txid)
  stream.writeUInt32(obj.receiptRef.cycle)
  stream.writeBigUInt64(BigInt(obj.receiptRef.timestamp))
  
  stream.writeUInt8(obj.receipt ? 1 : 0)
  if (obj.receipt) {
    serializeSignedReceipt(stream, obj.receipt as SignedReceiptSerializable, false)
  }
  
  stream.writeBigUInt64(BigInt(obj.ts))
}

export function deserializeStateCorrection(stream: VectorBufferStream): StateCorrectionMessage {
  const version = stream.readUInt8()
  if (version > cStateCorrectionVersion) {
    throw new Error('StateCorrection version mismatch')
  }
  
  const accountId = stream.readString()
  const correctStateHash = stream.readString()
  
  let correctData: any
  const hasCorrectData = stream.readUInt8()
  if (hasCorrectData) {
    correctData = Utils.safeJsonParse(stream.readString())
  }
  
  const receiptRef: SignedReceiptRef = {
    receiptId: stream.readString(),
    txid: stream.readString(),
    cycle: stream.readUInt32(),
    timestamp: Number(stream.readBigUInt64())
  }
  
  let receipt: SignedReceipt | undefined
  const hasReceipt = stream.readUInt8()
  if (hasReceipt) {
    receipt = deserializeSignedReceipt(stream)
  }
  
  const ts = Number(stream.readBigUInt64())
  
  return {
    accountId,
    correctStateHash,
    correctData,
    receiptRef,
    receipt,
    ts
  }
}

export function validateStateBeforeDissent(message: StateBeforeDissentMessage): boolean {
  if (!message.txid || !message.accountId || !message.observed || !message.ts) {
    return false
  }
  
  if (message.observed.length === 0 || message.observed.length > 100) {
    return false
  }
  
  for (const obs of message.observed) {
    if (!obs.hash || !obs.senderId) {
      return false
    }
  }
  
  const now = Date.now()
  const messageAge = now - message.ts
  
  if (messageAge < 0 || messageAge > 60000) {
    return false
  }
  
  return true
}

export function validateStateCorrection(message: StateCorrectionMessage): boolean {
  if (!message.accountId || !message.correctStateHash || !message.receiptRef || !message.ts) {
    return false
  }
  
  if (!message.receiptRef.receiptId || !message.receiptRef.txid) {
    return false
  }
  
  const now = Date.now()
  const messageAge = now - message.ts
  
  if (messageAge < 0 || messageAge > 60000) {
    return false
  }
  
  return true
}