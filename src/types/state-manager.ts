// State hardening Phase 1 types

export interface BeforeStateObservation {
  hash: string
  fromNodeId: string
  timestamp: number
}

export interface BeforeStateTracking {
  hashes: Set<string>
  samples: BeforeStateObservation[]
}