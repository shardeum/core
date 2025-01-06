import { config as destructuredConfig, setConfig } from '../../../src/p2p/Context'
import * as Context from '../../../src/p2p/Context'

describe('Config reference test', () => {
  it('should demonstrate stale references with destructured imports', () => {
    // Initial config with minimal structure
    const initialConfig = {
      p2p: {
        enableProblematicNodeRemoval: false
      }
    }

    // Set initial config
    setConfig(initialConfig as any)

    // Store references
    const destructuredRef = destructuredConfig!
    const contextRef = Context.config!

    // Verify initial state
    expect(destructuredRef.p2p.enableProblematicNodeRemoval).toBe(false)
    expect(contextRef.p2p.enableProblematicNodeRemoval).toBe(false)

    // Update config
    const newConfig = {
      p2p: {
        enableProblematicNodeRemoval: true
      }
    }
    setConfig(newConfig as any)

    // The destructured reference should be stale (still false)
    expect(destructuredRef.p2p.enableProblematicNodeRemoval).toBe(false)
    
    // The Context.config reference should be updated (true)
    expect(Context.config!.p2p.enableProblematicNodeRemoval).toBe(true)
  })
}) 