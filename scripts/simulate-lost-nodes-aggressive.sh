#!/bin/bash

# Script with aggressive settings to ensure nodes get marked as lost
# These settings are designed to exceed network timeouts and trigger lost detection

echo "=== Aggressive Lost Node Simulator ==="
echo "This script creates nodes that WILL be marked as lost"
echo "WARNING: These settings will make nodes nearly non-functional!"
echo ""

DEFAULT_HOST="localhost"

# Key insight: Network timeout is 5 seconds, so we need delays > 5000ms
# Lost detection requires consistent failures across multiple checks

function create_lost_node {
    local port=$1
    local preset=$2
    
    echo "Configuring node on port $port for aggressive lost behavior..."
    
    case "$preset" in
        "timeout")
            # Always exceed timeout - guaranteed to fail checks
            echo "  Setting as TIMEOUT node (always exceeds 5s timeout)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?missConsensus=0.9&networkDelay=10000&dropMessages=0.8&slowResponse=1.0&slowDelayMs=12000" > /dev/null
            ;;
            
        "mostly-dead")
            # Mostly unresponsive but occasionally works
            echo "  Setting as MOSTLY-DEAD node (90% failure rate)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?missConsensus=0.9&networkDelay=8000&dropMessages=0.9&slowResponse=0.9&slowDelayMs=10000" > /dev/null
            ;;
            
        "critical-lag")
            # Critical network lag that breaks consensus
            echo "  Setting as CRITICAL-LAG node (severe network issues)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?missConsensus=0.85&networkDelay=7000&dropMessages=0.7&slowResponse=0.85&slowDelayMs=9000" > /dev/null
            ;;
            
        "zombie")
            # Node that's technically alive but can't function
            echo "  Setting as ZOMBIE node (alive but non-functional)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?missConsensus=1.0&networkDelay=6000&dropMessages=0.95&slowResponse=0.95&slowDelayMs=8000" > /dev/null
            ;;
            
        *)
            # Default: guaranteed to trigger lost detection
            echo "  Setting as DEFAULT aggressive lost node"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?missConsensus=0.95&networkDelay=9000&dropMessages=0.85&slowResponse=0.9&slowDelayMs=11000" > /dev/null
            ;;
    esac
    
    echo "  ✓ Node configured for aggressive lost behavior"
    echo ""
}

# Helper function to check if lost detection is working
function check_lost_detection {
    local check_port=${1:-9001}
    
    echo "Checking lost node detection status..."
    
    # Check if the node is responsive
    if curl -s -m 2 "http://${DEFAULT_HOST}:${check_port}/nodelist" > /dev/null 2>&1; then
        echo "  Node on port $check_port is still responsive (may take time to be marked lost)"
    else
        echo "  Node on port $check_port is not responding (good!)"
    fi
    
    # Try to get problematic node data
    response=$(curl -s -m 5 "http://${DEFAULT_HOST}:9001/debug_problemNodeTrackerDump" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        echo "  Debug data retrieved successfully"
    else
        echo "  Could not retrieve debug data (nodes may be too unresponsive)"
    fi
}

# Main script
case "${1:-help}" in
    "setup")
        # Setup multiple nodes with aggressive settings
        echo "Setting up nodes with AGGRESSIVE lost detection settings..."
        echo "These nodes should be marked as lost within a few cycles."
        echo ""
        
        # Create different types of problematic nodes
        create_lost_node 9001 "timeout"
        create_lost_node 9002 "mostly-dead"
        create_lost_node 9003 "critical-lag"
        create_lost_node 9004 "zombie"
        
        echo "Setup complete! These nodes should be marked as lost soon."
        echo ""
        echo "IMPORTANT: Wait 2-3 cycles for lost detection to trigger"
        echo "Monitor with: $0 check"
        ;;
        
    "single")
        # Setup single node
        port=${2:-9001}
        preset=${3:-default}
        create_lost_node "$port" "$preset"
        
        echo "IMPORTANT: Lost detection takes 2-3 cycles"
        echo "The node needs to fail multiple checks from different nodes"
        ;;
        
    "check")
        # Quick check of node status
        port=${2:-9001}
        check_lost_detection "$port"
        ;;
        
    "monitor")
        # Use the original monitor function
        ./scripts/simulate-refute-nodes.sh monitor ${2:-9001}
        ;;
        
    "reset")
        # Reset nodes
        echo "Resetting nodes to normal behavior..."
        for port in 9001 9002 9003 9004; do
            echo "  Resetting port $port"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?reset=true" > /dev/null
        done
        echo "Done!"
        ;;
        
    *)
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  setup              - Configure nodes 9001-9004 with AGGRESSIVE settings"
        echo "  single PORT TYPE   - Configure single node (types: timeout, mostly-dead, critical-lag, zombie)"
        echo "  check [PORT]       - Quick check if node is responding"
        echo "  monitor [PORT]     - Monitor refute accumulation (uses original script)"
        echo "  reset              - Reset all nodes to normal"
        echo ""
        echo "Examples:"
        echo "  $0 setup                       # Setup 4 aggressive lost nodes"
        echo "  $0 single 9005 timeout         # Make port 9005 always timeout"
        echo "  $0 check 9001                  # Check if node is responding"
        echo ""
        echo "How lost detection works:"
        echo "  1. Network timeout is 5 seconds"
        echo "  2. Nodes with delays > 5s will fail health checks"
        echo "  3. Multiple nodes must confirm a node is down"
        echo "  4. Takes 2-3 cycles for consensus on lost status"
        echo "  5. Lost nodes can then refute their status"
        echo ""
        echo "Recommended settings to trigger lost detection:"
        echo "  - networkDelay: 6000-10000ms (exceeds 5s timeout)"
        echo "  - slowDelayMs: 7000-12000ms (exceeds 5s timeout)"
        echo "  - dropMessages: 0.5-0.9 (50-90% packet loss)"
        echo "  - missConsensus: 0.8-1.0 (miss most/all consensus)"
        ;;
esac