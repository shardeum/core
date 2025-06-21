import { publicKey } from '@shardeum-foundation/lib-types'
import { SignedObject } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import {
  ArchiverDownMsg,
  ArchiverRefutesLostMsg,
  ArchiverUpMsg,
  InvestigateArchiverMsg,
} from '@shardeum-foundation/lib-types/build/src/p2p/LostArchiverTypes'
import { lostArchiversMap, LostArchiverRecord } from '../../../../src/p2p/LostArchivers/state'

describe('LostArchivers state', () => {
  beforeEach(() => {
    // Clear the map before each test
    lostArchiversMap.clear()
  })

  describe('lostArchiversMap', () => {
    it('should be a Map instance', () => {
      expect(lostArchiversMap).toBeInstanceOf(Map)
    })

    it('should be initially empty', () => {
      expect(lostArchiversMap.size).toBe(0)
    })

    it('should store and retrieve LostArchiverRecord', () => {
      const testPublicKey = 'test-public-key-123' as publicKey
      const testRecord: LostArchiverRecord = {
        isInvestigator: true,
        gossippedDownMsg: false,
        gossippedUpMsg: false,
        target: 'target-public-key' as publicKey,
        status: 'reported',
        cyclesToWait: 5
      }

      lostArchiversMap.set(testPublicKey, testRecord)

      expect(lostArchiversMap.has(testPublicKey)).toBe(true)
      expect(lostArchiversMap.get(testPublicKey)).toEqual(testRecord)
    })

    it('should handle multiple records', () => {
      const record1: LostArchiverRecord = {
        isInvestigator: false,
        gossippedDownMsg: true,
        gossippedUpMsg: false,
        target: 'target1' as publicKey,
        status: 'investigating',
        cyclesToWait: 3
      }

      const record2: LostArchiverRecord = {
        isInvestigator: true,
        gossippedDownMsg: false,
        gossippedUpMsg: true,
        target: 'target2' as publicKey,
        status: 'down',
        cyclesToWait: 0
      }

      lostArchiversMap.set('key1' as publicKey, record1)
      lostArchiversMap.set('key2' as publicKey, record2)

      expect(lostArchiversMap.size).toBe(2)
      expect(lostArchiversMap.get('key1' as publicKey)).toEqual(record1)
      expect(lostArchiversMap.get('key2' as publicKey)).toEqual(record2)
    })

    it('should update existing records', () => {
      const key = 'test-key' as publicKey
      const initialRecord: LostArchiverRecord = {
        isInvestigator: false,
        gossippedDownMsg: false,
        gossippedUpMsg: false,
        target: 'target' as publicKey,
        status: 'reported',
        cyclesToWait: 5
      }

      lostArchiversMap.set(key, initialRecord)
      
      const updatedRecord: LostArchiverRecord = {
        ...initialRecord,
        status: 'up',
        gossippedUpMsg: true
      }

      lostArchiversMap.set(key, updatedRecord)

      expect(lostArchiversMap.size).toBe(1)
      expect(lostArchiversMap.get(key)).toEqual(updatedRecord)
    })

    it('should delete records', () => {
      const key = 'test-key' as publicKey
      const record: LostArchiverRecord = {
        isInvestigator: true,
        gossippedDownMsg: false,
        gossippedUpMsg: false,
        target: 'target' as publicKey,
        status: 'down',
        cyclesToWait: 2
      }

      lostArchiversMap.set(key, record)
      expect(lostArchiversMap.has(key)).toBe(true)

      lostArchiversMap.delete(key)
      expect(lostArchiversMap.has(key)).toBe(false)
      expect(lostArchiversMap.size).toBe(0)
    })

    it('should handle optional fields in LostArchiverRecord', () => {
      const recordWithOptionalFields: LostArchiverRecord = {
        isInvestigator: true,
        gossippedDownMsg: true,
        gossippedUpMsg: false,
        target: 'target' as publicKey,
        status: 'investigating',
        cyclesToWait: 4,
        investigateMsg: {} as SignedObject<InvestigateArchiverMsg>,
        archiverDownMsg: {} as SignedObject<ArchiverDownMsg>,
        archiverUpMsg: {} as SignedObject<ArchiverUpMsg>,
        archiverRefuteMsg: {} as SignedObject<ArchiverRefutesLostMsg>
      }

      lostArchiversMap.set('key-with-optional' as publicKey, recordWithOptionalFields)
      
      const retrieved = lostArchiversMap.get('key-with-optional' as publicKey)
      expect(retrieved).toBeDefined()
      expect(retrieved?.investigateMsg).toBeDefined()
      expect(retrieved?.archiverDownMsg).toBeDefined()
      expect(retrieved?.archiverUpMsg).toBeDefined()
      expect(retrieved?.archiverRefuteMsg).toBeDefined()
    })

    it('should handle all status types', () => {
      const statuses: LostArchiverRecord['status'][] = ['reported', 'investigating', 'down', 'up']
      
      statuses.forEach((status, index) => {
        const record: LostArchiverRecord = {
          isInvestigator: index % 2 === 0,
          gossippedDownMsg: index > 1,
          gossippedUpMsg: index === 3,
          target: `target-${index}` as publicKey,
          status,
          cyclesToWait: index
        }
        
        lostArchiversMap.set(`key-${status}` as publicKey, record)
      })

      expect(lostArchiversMap.size).toBe(4)
      
      statuses.forEach(status => {
        const record = lostArchiversMap.get(`key-${status}` as publicKey)
        expect(record?.status).toBe(status)
      })
    })
  })

  describe('LostArchiverRecord type', () => {
    it('should accept valid record structure', () => {
      const validRecord: LostArchiverRecord = {
        isInvestigator: false,
        gossippedDownMsg: true,
        gossippedUpMsg: false,
        target: 'valid-target' as publicKey,
        status: 'reported',
        cyclesToWait: 10
      }

      expect(() => {
        lostArchiversMap.set('valid-key' as publicKey, validRecord)
      }).not.toThrow()
    })
  })
})