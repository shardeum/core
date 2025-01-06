## Current Node.js Related Processes

### Shardus Tool Structure
- Globally installed at `/home/zb/.nodenv/versions/18.19.1/lib/node_modules/shardus`
- Version: 4.3.1
- Dependencies include @shardus/network-tool@4.4.0 (latest version)
- Two installations detected:
  1. Direct installation (shardus@4.3.1)
  2. Linked installation through shardeum@1.16.2

### PM2 Status
- Custom PM2 fork is used by design:
  - Source: git+https://github.com/theDigg/pm2#count-exit-errors
  - Required by @shardus/network-tool for specific functionality
  - This is the intended PM2 version, not a broken installation
- No active PM2 processes running

### Node Version Requirements
- Currently using Node 18.19.1 (set by .node-version)
- Shardus tool requires Node 18.16.1
- network-tool requires Node ">=18.16.1 <19.0.0"
  - Current version (18.19.1) is within this range
  - No version conflict exists

### Running Node Processes
1. Cursor IDE Related (All under /tmp/.mount_cursor7tChra/):
   - Multiple Node.js service workers (PIDs: 1637694, 1637778, 1638118, 1638128)
   - JSON language server (PID: 1638272)
   - GitHub Actions extension (PID: 1638308)
   - Markdown language features (PID: 1638979)
   - TypeScript installer (PID: 1639045)

2. Discord Related:
   - One renderer process (PID: 1634644)

### Analysis
- No orphaned Shardeum processes found
- No PM2 managed processes running
- All Node.js processes appear to be legitimate IDE (Cursor) or application (Discord) related
- No cleanup needed for Shardeum-related processes

### Notes
- All Cursor processes are properly contained in /tmp
- No unexpected background Node.js services found
- System appears clean from previous Shardeum installations
- The custom PM2 fork is a required dependency, not a problem to fix
- Node version 18.19.1 is compatible with all requirements 