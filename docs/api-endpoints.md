# API Endpoints Documentation

This document provides a comprehensive list of API endpoints available in the project.

## Table of Contents

- [Authentication](#authentication)
- [External API Endpoints](#external-api-endpoints)
  - [GET Endpoints](#get-endpoints)
  - [POST Endpoints](#post-endpoints)
- [Internal API Endpoints](#internal-api-endpoints)
  - [Internal Binary Routes](#internal-binary-routes)
  - [Gossip Routes](#gossip-routes)

## Authentication

Many API endpoints require authentication through debug mode middleware. The project uses different levels of debug mode middleware for authentication:

- `isDebugModeMiddleware` - Basic debug mode check
- `isDebugModeMiddlewareLow` - Low-level debug access
- `isDebugModeMiddlewareMedium` - Medium-level debug access
- `isDebugModeMiddlewareHigh` - High-level debug access
- `isDebugModeMiddlewareMultiSig` - Multi-signature debug access

## External API Endpoints

These are the HTTP endpoints exposed to clients that can be accessed via standard HTTP requests.

### GET Endpoints

#### Core Node Information

1. `/nodeInfo`
   - **Description**: Returns information about the current node
   - **Parameters**: 
     - `reportIntermediateStatus` (optional, boolean): Include intermediate status
     - `debug` (optional, boolean): Include debug information
   - **Response**: Node information including ID, status, and app data
   - **Authentication**: None

2. `/config`
   - **Description**: Returns the server configuration
   - **Response**: JSON object containing the server configuration
   - **Authentication**: Requires debug mode middleware (low level)

3. `/netconfig`
   - **Description**: Returns the network configuration
   - **Response**: JSON object containing network configuration
   - **Authentication**: None

4. `/network-stats`
   - **Description**: Returns network statistics
   - **Response**: JSON object with network statistics
   - **Authentication**: None

#### Node Status and Joining

5. `/joinInfo`
   - **Description**: Returns detailed information about the node's join status
   - **Response**: JSON object with join-related information including standby list
   - **Authentication**: Requires debug mode middleware (medium level)

6. `/standby-list-debug`
   - **Description**: Returns the list of nodes in standby
   - **Response**: Array of nodes in the standby list
   - **Authentication**: Requires debug mode middleware (low level)

7. `/status-history`
   - **Description**: Returns the node's status history
   - **Response**: JSON object with status history
   - **Authentication**: Requires debug mode middleware (low level)

8. `/debug-neverGoActive`
   - **Description**: Toggles the neverGoActive flag
   - **Response**: Current state of neverGoActive flag
   - **Authentication**: Requires debug mode middleware

#### Archivers and Data

9. `/archivers`
   - **Description**: Returns list of archivers
   - **Response**: JSON object with archiver information
   - **Authentication**: None

10. `/joinedArchiver/:publicKey`
    - **Description**: Checks if an archiver is joined
    - **Parameters**: `publicKey` (path parameter)
    - **Response**: Boolean indicating if the archiver is joined
    - **Authentication**: None

11. `/datarecipients`
    - **Description**: Returns data recipients
    - **Response**: JSON object with data recipients
    - **Authentication**: None

12. `/download-snapshot-data`
    - **Description**: Downloads snapshot data
    - **Response**: Snapshot data stream
    - **Authentication**: None

#### System Control

13. `/forceCycleSync`
    - **Description**: Forces cycle synchronization
    - **Parameters**: `enable` (boolean): Enable/disable forced cycle sync
    - **Response**: Socket report
    - **Authentication**: Requires debug mode middleware

#### Time Management

14. `/calculate-fake-time-offset`
    - **Description**: Calculates a fake time offset
    - **Parameters**:
      - `shift` (integer): Time shift
      - `spread` (integer): Time spread
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (high level)

15. `/clear-fake-time-offset`
    - **Description**: Clears the fake time offset
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (high level)

16. `/time-report`
    - **Description**: Returns time-related information
    - **Response**: JSON object with time information
    - **Authentication**: Requires debug mode middleware

#### Logging and Debugging

17. `/log-fatal`
    - **Description**: Sets log level to fatal
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

18. `/log-disable`
    - **Description**: Disables all logs
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

19. `/log-error`
    - **Description**: Sets log level to error
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

20. `/log-default`
    - **Description**: Sets log level to default
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

21. `/log-flag`
    - **Description**: Sets a specific log flag
    - **Parameters**:
      - `name` (string): Flag name
      - `value` (boolean): Flag value
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

22. `/log-getflags`
    - **Description**: Gets all log flags
    - **Response**: JSON object with all log flags
    - **Authentication**: Requires debug mode middleware (low level)

23. `/debug-clearlog`
    - **Description**: Clears logs
    - **Parameters**: `file` (string): File to clear
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

24. `/debug`
    - **Description**: Gets debug archive
    - **Response**: Debug archive stream
    - **Authentication**: Requires debug mode middleware (medium level)

25. `/debug-logfile`
    - **Description**: Gets a specific log file
    - **Parameters**: `file` (string): File to get
    - **Response**: Log file content
    - **Authentication**: Requires debug mode middleware (medium level)

#### Performance Monitoring

26. `/socketReport`
    - **Description**: Returns a report of socket connections
    - **Response**: JSON object with socket connection details
    - **Authentication**: Requires debug mode middleware (low level)

27. `/memory`
    - **Description**: Gets memory usage information
    - **Response**: Memory usage details
    - **Authentication**: Requires debug mode middleware (low level)

28. `/memory-short`
    - **Description**: Gets short memory usage information
    - **Response**: Brief memory usage details
    - **Authentication**: Requires debug mode middleware

29. `/memory-gc`
    - **Description**: Triggers garbage collection
    - **Response**: Memory usage after garbage collection
    - **Authentication**: Requires debug mode middleware

30. `/perf`
    - **Description**: Gets performance report
    - **Response**: Performance metrics
    - **Authentication**: Requires debug mode middleware

31. `/perf-scoped`
    - **Description**: Gets scoped performance report
    - **Response**: Scoped performance metrics
    - **Authentication**: Requires debug mode middleware

32. `/combined-debug`
    - **Description**: Gets combined debug information
    - **Parameters**: `wait` (integer): Wait time in seconds
    - **Response**: Combined debug information
    - **Authentication**: Requires debug mode middleware (low level)

#### Load Management

33. `/loadset`
    - **Description**: Sets load parameters
    - **Parameters**: `load` (number): Load value
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware

34. `/loadreset`
    - **Description**: Resets load parameters
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware

35. `/load`
    - **Description**: Gets load information
    - **Response**: Current load information
    - **Authentication**: None

#### Transaction Management

36. `/debug-network-txlist`
    - **Description**: Gets network transaction list
    - **Response**: List of network transactions
    - **Authentication**: Requires debug mode middleware

37. `/debug-network-txlisthash`
    - **Description**: Gets network transaction list hash
    - **Response**: Hash of the network transaction list
    - **Authentication**: Requires debug mode middleware

38. `/debug-clear-network-txlist`
    - **Description**: Clears network transaction list
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware

39. `/debug-network-txcount`
    - **Description**: Gets network transaction count
    - **Response**: Count of network transactions
    - **Authentication**: Requires debug mode middleware

40. `/tx-stats`
    - **Description**: Gets transaction statistics
    - **Response**: Transaction statistics
    - **Authentication**: None

#### Cycle Recording

41. `/debug-cycle-recording-enable`
    - **Description**: Enables cycle recording
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

42. `/debug-cycle-recording-clear`
    - **Description**: Clears cycle recording
    - **Response**: Success confirmation
    - **Authentication**: Requires debug mode middleware (medium level)

43. `/debug-cycle-recording-download`
    - **Description**: Downloads cycle recording
    - **Response**: Cycle recording data
    - **Authentication**: Requires debug mode middleware (medium level)

### POST Endpoints

1. `/exit`
   - **Description**: Shuts down the node
   - **Response**: Success confirmation before shutdown
   - **Authentication**: Requires debug mode middleware (high level)

2. `/exit-apop`
   - **Description**: Initiates apoptosis (self-removal) of the node
   - **Response**: Success confirmation before apoptosis
   - **Authentication**: Requires debug mode middleware (high level)

3. `/testGlobalAccountTX`
   - **Description**: Test endpoint for global account transactions
   - **Request Body**: Transaction object
   - **Response**: Success confirmation
   - **Authentication**: Requires debug mode middleware

4. `/testGlobalAccountTXSet`
   - **Description**: Test endpoint for global account transaction sets
   - **Request Body**: Transaction object
   - **Response**: Success confirmation
   - **Authentication**: Requires debug mode middleware

5. `/get-tx-receipt`
   - **Description**: Gets transaction receipt
   - **Request Body**: Transaction ID
   - **Response**: Transaction receipt
   - **Authentication**: None

6. `/joinarchiver`
   - **Description**: Joins an archiver
   - **Request Body**: Join archiver information
   - **Response**: Success confirmation
   - **Authentication**: None

7. `/leavingarchivers`
   - **Description**: Leaves archivers
   - **Request Body**: Leaving archivers information
   - **Response**: Success confirmation
   - **Authentication**: None

8. `/requestdata`
   - **Description**: Requests data
   - **Request Body**: Data request information
   - **Response**: Requested data
   - **Authentication**: None

9. `/querydata`
   - **Description**: Queries data
   - **Request Body**: Query information
   - **Response**: Query results
   - **Authentication**: None

## Internal API Endpoints

These endpoints are used for internal communication between nodes in the network and are not directly accessible via HTTP.

### Internal Binary Routes

1. `binary_gossip`
   - **Description**: Handles binary gossip messages between nodes
   - **Usage**: Used for efficient propagation of information across the network
   - **Handler**: `gossipInternalBinaryRoute`

2. `binary_compare_cert`
   - **Description**: Compares certificates between nodes
   - **Usage**: Used during cycle creation and consensus
   - **Handler**: `compareCertBinaryHandler`

3. `binary_sign_app_data`
   - **Description**: Signs application data
   - **Usage**: Used for cryptographic verification of application data
   - **Handler**: Defined in `src/shardus/index.ts`

### Gossip Routes

1. `gossip-cert`
   - **Description**: Handles certificate gossip
   - **Usage**: Used to propagate cycle certificates across the network
   - **Handler**: `gossipCertRoute`

2. `gossip-active`
   - **Description**: Handles active status gossip
   - **Usage**: Used to propagate node status changes to active
   - **Handler**: `gossipActiveRoute`

## Error Handling

Most API endpoints return error responses in the following format:

```json
{
  "error": "Error message",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 500: Internal Server Error

## Notes

- Many endpoints are for debugging purposes and should not be used in production.
- Authentication is required for most debug endpoints.
- Internal endpoints are not directly accessible via HTTP and are used for node-to-node communication.