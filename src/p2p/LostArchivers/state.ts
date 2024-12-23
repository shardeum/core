import { publicKey } from '@shardus/types';
import { SignedObject } from '@shardus/types/build/src/p2p/P2PTypes';
import { ArchiverDownMsg, ArchiverRefutesLostMsg, ArchiverUpMsg, InvestigateArchiverMsg } from '@shardus/types/build/src/p2p/LostArchiverTypes';
export interface LostArchiverRecord {
    isInvestigator: boolean;
    gossippedDownMsg: boolean;
    gossippedUpMsg: boolean;
    target: publicKey;
    status: 'reported' | 'investigating' | 'down' | 'up';
    investigateMsg?: SignedObject<InvestigateArchiverMsg>;
    archiverDownMsg?: SignedObject<ArchiverDownMsg>;
    archiverUpMsg?: SignedObject<ArchiverUpMsg>;
    archiverRefuteMsg?: SignedObject<ArchiverRefutesLostMsg>;
    cyclesToWait: number;
}
export const lostArchiversMap = new Map<publicKey, LostArchiverRecord>();