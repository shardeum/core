# CLI Commands for Node Information

## Getting Active Node Information
Using curl to get node information from a validator:

```bash
# Get list of active nodes with IPs and ports
curl http://<validator-ip>:<validator-port>/nodelist_debug

# Get general network stats including number of active nodes
curl http://<validator-ip>:<validator-port>/network-stats
```

## Tips
1. The validator's API port is typically different from its P2P port
2. You can use `jq` to format and filter the JSON output:
   ```bash
   # Pretty print the output
   curl -s http://<validator-ip>:<validator-port>/nodelist_debug | jq '.'
   
   # Get only IPs and ports
   curl -s http://<validator-ip>:<validator-port>/nodelist_debug | jq -r '.[] | "\(.ip):\(.port)"'
   ```

## Example Usage
```bash
# Example with jq to get a clean list of ip:port combinations
curl -s http://localhost:9001/nodelist_debug | jq -r '.[] | "\(.ip):\(.port)"'
``` 