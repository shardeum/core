## Shardeum Port Configuration

### Default Port Configuration
- External Port: 9001 (configurable)
- Internal Port: 10001 (configurable)

### Port Configuration Options
The system supports several ways to configure ports:
1. Manual configuration through `ip` settings
2. Auto-discovery using 'auto' setting
3. Default fallback values if not specified

### Port Usage
1. External Port (default: 9001)
   - Used for external API communication
   - Handles HTTP/HTTPS traffic
   - Used by external clients to interact with the node

2. Internal Port (default: 10001)
   - Used for internal node-to-node communication
   - Handles P2P network traffic
   - Critical for network consensus and synchronization

### Configuration Methods
```typescript
ip: {
    externalIp: string | 'auto'
    externalPort: number | 'auto'
    internalIp: string | 'auto'
    internalPort: number | 'auto'
}
```

### Port Selection Process
1. If set to 'auto':
   - System will attempt to discover external IP
   - Will try to find next available port
   - Uses UPnP/PMP for port forwarding if needed
2. If manually configured:
   - Uses specified ports directly
3. Fallback:
   - Uses default values (9001/10001) if no other option works

### Important Notes
- Both ports must be accessible from the network
- UPnP/PMP support is built-in for automatic port forwarding
- System will verify port availability before binding
- Ports can be configured via configuration file or environment variables 