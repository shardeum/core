# API Endpoint Registration Pattern

The Shardeum codebase registers API endpoints using the following methods:
- `shardus.registerExternalGet` - For GET endpoints
- `shardus.registerExternalPut` - For PUT endpoints
- Other HTTP methods follow similar pattern: `registerExternal{METHOD}`

These are used to expose REST API endpoints for the validator node. 