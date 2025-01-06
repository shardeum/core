import { expect } from 'chai'
import { config as destructuredConfig, setConfig } from '../../../p2p/Context'
import * as Context from '../../../p2p/Context'

describe('Config reference test', () => {
  it('should demonstrate stale references with destructured imports', () => {
    // Initial config
    const initialConfig = {
      p2p: {
        enableProblematicNodeRemoval: false
      }
    } as any

    // Set initial config
    setConfig(initialConfig)

    // Store references
    const destructuredRef = destructuredConfig
    const contextRef = Context.config

    // Verify initial state
    expect(destructuredRef.p2p.enableProblematicNodeRemoval).to.be.false
    expect(contextRef.p2p.enableProblematicNodeRemoval).to.be.false

    // Update config
    const newConfig = {
      p2p: {
        enableProblematicNodeRemoval: true
      }
    } as any
    setConfig(newConfig)

    // The destructured reference should be stale (still false)
    expect(destructuredRef.p2p.enableProblematicNodeRemoval).to.be.false
    
    // The Context.config reference should be updated (true)
    expect(Context.config.p2p.enableProblematicNodeRemoval).to.be.true
  })
}) 