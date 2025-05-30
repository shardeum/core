/**
 * Type definitions for SyncV2 module
 */

import { P2P } from '@shardeum-foundation/lib-types'

declare module '@shardeum-foundation/lib-types' {
  namespace P2P {
    namespace SyncV2 {
      interface CycleHistorySyncRequest {
        requestedHistoryLength: number  // Usually problematicNodeHistoryLength
      }

      interface CycleHistorySyncResponse {
        currentCycle: P2P.CycleCreatorTypes.CycleRecord       // Latest cycle for easy access
        historicalCycles: P2P.CycleCreatorTypes.CycleRecord[] // Previous N cycles, ordered oldest first
        oldestAvailable: number
        newestAvailable: number
      }
    }
  }
}

export {} // Make this a module