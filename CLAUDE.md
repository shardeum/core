# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is Shardus Core (`@shardeum-foundation/core`), the foundational technology for building distributed/sharded blockchain applications. It implements a sophisticated consensus system with P2P networking, state management, and transaction processing capabilities.

## Development Commands

### Build Commands
- `npm run build:dev` - Build TypeScript to JavaScript (for development)
- `npm run build:release` - Build to bytecode for production release
- `npm run clean` - Clean build artifacts

### Code Quality
- `npm run format-check` - Check code formatting with Prettier
- `npm run format-fix` - Fix code formatting with Prettier
- `npm run depcheck` - Check for unused dependencies

### Testing
- `npm test test` - Run unit tests with Jest

### Requirements
- Node.js version: 20.19.3 (exact version required)
- Rust toolchain must be installed (cargo must be in PATH)

## Architecture Overview

### Core Components

1. **P2P Layer** (`src/p2p/`)
   - **Join Protocol v2**: Handles node joining process with multi-phase validation
   - **Cycle Management**: Implements cycle-based consensus rounds (CycleChain, CycleCreator, CycleParser)
   - **Network Operations**: Sync, Apoptosis (node removal), Rotation, Lost node detection
   - **Archiver System**: Manages data persistence across archivers

2. **State Manager** (`src/state-manager/`)
   - **Account Management**: Caching, synchronization, and partitioning of account states
   - **Transaction Processing**: Queue management, consensus, and receipt generation
   - **Repair Mechanisms**: Handles data repair and synchronization across shards

3. **Cryptography** (`src/crypto/`)
   - Proof of Work (POW) generation for network operations
   - Integration with `@shardeum-foundation/lib-crypto-utils`

4. **Storage** (`src/storage/`)
   - SQLite3 and Better-SQLite3 support for persistent storage
   - Database initialization and management

### Detailed Spec Docs

Detailed documentation on the following functionality can be found in these .md files if needed:

1. **Shard Calculations**: `@docs/specs/shardCalculations.spec.md`
2. **Shard Functions**: `@docs/specs/shardFunctions.spec.md`
3. **Validator Lifecycle**: `@docs/specs/validator-lifecycle.md`

### Key Design Patterns

1. **Cycle-Based Consensus**: The network operates in cycles where nodes collectively agree on network state changes
2. **Sharding**: Data is partitioned across nodes based on address space
3. **Account-Based Model**: State is organized around accounts with synchronization protocols
4. **Multi-Phase Protocols**: Critical operations (like joining) use multiple validation phases

### Important Type Definitions

- Type definitions are in `src/types/` with runtime validation using AJV
- Path aliases configured:
  - `@src/*` → `src/*`
  - `@utils/*` → `src/utils/*`
  - `@test/*` → `test/*`

### Testing Approach

- Unit tests mirror source structure in `test/unit/`
- Integration tests in `test/integration/`
- Jest configuration in `jest.config.js`
- Tests use TypeScript and ts-jest

### Security Considerations

- ESLint configured with security plugins
- Never commit secrets or API keys
- Extensive input validation using AJV schemas
- Network operations use cryptographic signatures

### Common Development Tasks

When modifying network protocols:
1. Check the relevant documentation in `/docs` (e.g., join protocol, safety mode)
2. Update both the implementation and corresponding unit tests
3. Consider impacts on cycle consensus and state synchronization

When working with state management:
1. Understand partition assignments and account coverage
2. Follow existing patterns for transaction queuing and consensus
3. Ensure proper cleanup in failure scenarios

### Release Process

The project uses bytecode compilation for production releases:
- Development builds use plain JavaScript
- Release builds compile to bytecode using Bytenode
- The `dist/` directory contains the final build artifacts