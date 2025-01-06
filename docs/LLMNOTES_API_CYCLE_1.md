# Cycle-Related API Endpoints

## Main Cycle Endpoints
- `/sync-newest-cycle` - Returns the newest cycle information
- `/cycle-by-marker?marker={cycleMarker}` - Gets cycle information for a specific cycle marker
- `/debug-cycle-recording-enable` - Debug endpoint to enable cycle recording
- `/debug-cycle-recording-clear` - Debug endpoint to clear cycle recording data
- `/debug-cycle-recording-download` - Debug endpoint to download cycle recording data

## Related Information
- Cycles are tracked in the CycleChain module
- Each cycle has a unique marker and contains information about active nodes, joined nodes, etc.
- The current cycle can be determined by the node's internal state 