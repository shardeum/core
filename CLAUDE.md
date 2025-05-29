# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, Test, and Development Commands

### Build Commands
- `npm run build:dev` - Development build with optimizations disabled
- `npm run build:release` - Production build with bytecode compilation
- `npm run build` - Alias for build:dev
- `./build` - Build script in parent directory (NOT build.sh)

### Testing
- `npm test` - Run all tests
- `npm run test-watch` - Run tests in watch mode
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests

### Code Quality
- `npm run lint` - Run ESLint checks
- `npm run fix` - Auto-fix ESLint issues
- `npm run format-check` - Check code formatting with Prettier
- `npm run format-fix` - Auto-fix formatting issues

### Development
- Node.js version: 18.19.1 (use nvm)
- `npm run compile` - Compile TypeScript without webpack
- `npm start` - Start the application

## High-Level Architecture

Shardus Core is a distributed systems framework for building sharded applications. The architecture follows a layered, modular design:

### Core Components

1. **Main Entry (`src/shardus/index.ts`)**
   - Central `Shardus` class extending EventEmitter
   - Orchestrates all subsystems and provides the main API
   - Large files in this module are split with methods bound via `Object.assign()` to the prototype

2. **State Management (`src/state-manager/`)**
   - `StateManager` - Central coordinator for state operations
   - `TransactionQueue` - Manages transaction lifecycle (split into .core, .entry, .fact, .handlers modules)
   - `AccountCache` - High-performance account state caching
   - `AccountPatcher` - Repairs inconsistent states (split into .finder, .handlers modules)
   - `TransactionConsensus` - Distributed consensus mechanism
   - Files exceeding 25k tokens are split into sub-modules

3. **P2P Networking (`src/p2p/`)**
   - `Context` - Dependency injection container
   - `Wrapper` - Main P2P interface
   - `CycleCreator/Chain` - Network cycle synchronization
   - `Join/v2` - Node joining protocol
   - `NodeList` - Active node tracking
   - `Apoptosis` - Graceful shutdown

4. **Key Architectural Patterns**
   - **Event-Driven**: EventEmitter for loose coupling
   - **Sharding**: Dynamic partition assignment
   - **Gossip Protocol**: Efficient message propagation
   - **Consensus**: Multi-phase with receipt-based voting
   - **Fault Tolerance**: Automatic node failure detection and state repair

### Data Flow
1. Transactions → `put()` → `TransactionQueue`
2. Queue validates → assigns consensus groups
3. Consensus voting → state application via app callbacks
4. Results propagated → network and archivers

### Application Interface
Applications must implement:
- `validate(tx, appData)` - Transaction validation
- `crack(tx, appData)` - Extract transaction metadata
- `apply(tx, wrappedStates, appData)` - Apply state changes
- `updateAccountFull/Partial()` - Account state updates
- `calculateAccountHash()` - State verification

### Module Dependencies
- Most modules depend on `Context` for shared services
- State Manager depends on P2P for network communication
- P2P modules use Network layer for transport
- All modules use Logger and Utils

### Important Configurations
- Network modes: `forming`, `processing`, `safety`, `recovery`, `restart`, `restore`, `shutdown`
- Cycle phases: Q1-Q4 with specific timing for different operations
- State syncing happens during node join and continuous operation

## Token Limits and File Splitting

Due to LLM token limits (25k), large files are split:
- Methods are extracted to separate files and bound back using `Object.assign(Class.prototype, methods)`
- Look for imports like `methodsFromFile` or files ending in `.handlers.ts`, `.finder.ts`, etc.
- When modifying split files, ensure method signatures match the original class interface

## Network Communication

- Internal routes use binary serialization for efficiency
- Most endpoints have both JSON and binary versions
- Binary handlers are in `src/types/` with serialize/deserialize functions
- Route enums in `src/types/enum/InternalRouteEnum.ts`