# Configuration Updates and Problematic Node Removal

## Key Findings

### Configuration Update Mechanism
- Configuration is exported as a mutable variable in `Context.ts`
- Updates are applied through `setConfig` function
- Multisig transactions can trigger configuration changes at runtime

### Import Patterns
- Two ways to import config:
  1. Destructured import: `import { config } from './Context'`
  2. Module import: `import * as Context from './Context'`
- Destructured imports can become stale when config is reassigned
- Module imports always reference latest config value

### Problematic Node Removal Feature
- Nodes appear in `refuted` array correctly
- `refuteCycles` not being updated as expected
- Possible causes:
  1. Stale config references affecting feature enablement checks
  2. Timing issues with cycle updates
  3. Inconsistent import patterns across codebase

### Affected Files
- `NodeList.ts`: Uses both destructured and module imports
- `Rotation.ts`: Uses destructured imports but appears to work
- Other files with potential issues: `ServiceQueue.ts`, `Utils.ts`, `Wrapper.ts`

## Recommendations
1. Standardize on module imports (`import * as Context`) to avoid stale references
2. Add logging around configuration updates to track changes
3. Review all files using destructured imports for potential issues
4. Consider adding tests to verify configuration update propagation

## Open Questions
1. Why do some features work despite using destructured imports?
2. Are there other runtime configuration updates that might be affected?
3. How widespread is the impact of stale references? 