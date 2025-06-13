#!/bin/bash

# Simple test script using only existing debug endpoints
# No code changes required - works with current implementation

echo "=== Simple Problematic Node Test ==="
echo "Using existing debug endpoints to create problematic nodes"
echo ""

function setup_problematic_nodes {
    echo "Setting up nodes to be problematic..."
    echo ""
    
    # Node 1: High network delay (will miss consensus)
    echo "Node 9001: Adding 3 second network delay"
    curl -s "http://localhost:9001/debug-network-delay?delay=3000"
    echo ""
    
    # Node 2: Higher delay
    echo "Node 9002: Adding 5 second network delay"
    curl -s "http://localhost:9002/debug-network-delay?delay=5000"
    echo ""
    
    # Node 3: Moderate delay + will produce bad votes
    echo "Node 9003: Adding 2 second delay + bad votes"
    curl -s "http://localhost:9003/debug-network-delay?delay=2000"
    curl -s "http://localhost:9003/debug-produceBadVote"
    echo ""
    
    echo "Setup complete!"
    echo ""
    echo "Expected behavior:"
    echo "- Nodes will miss consensus due to delays"
    echo "- Other nodes will mark them as 'lost'"
    echo "- They will refute (claim they're still good)"
    echo "- Refutes will accumulate in cycle records"
    echo "- After 6+ refutes, they'll be marked as problematic"
}

function reset_nodes {
    echo "Resetting nodes to normal..."
    
    for port in 9001 9002 9003; do
        echo "  Resetting port $port"
        curl -s "http://localhost:${port}/debug-network-delay?delay=0"
    done
    
    echo "Done!"
}

function check_refutes {
    echo "Checking for refutes..."
    
    response=$(curl -s "http://localhost:9001/debug_problemNodeTrackerDump")
    
    if [ $? -eq 0 ]; then
        echo "Nodes with refutes:"
        echo "$response" | jq -r '.data.nodeHistories | 
            to_entries[] | 
            select(.value.refuteCycles | length > 0) | 
            "  \(.key): \(.value.refuteCycles | length) refutes, problematic: \(.value.stats.isProblematic)"'
        
        # Show shadow mode stats
        shadow=$(echo "$response" | jq '.data.shadowModeStats' 2>/dev/null)
        if [ "$shadow" != "null" ]; then
            echo ""
            echo "Shadow mode comparison:"
            echo "$shadow" | jq -r '"  Match rate: \(.matchRate * 100)%"' 2>/dev/null
        fi
    else
        echo "Failed to get data"
    fi
}

# Main menu
case "${1:-help}" in
    "setup")
        setup_problematic_nodes
        ;;
    "reset")
        reset_nodes
        ;;
    "check")
        check_refutes
        ;;
    *)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  setup  - Make nodes 9001-9003 problematic"
        echo "  reset  - Reset nodes to normal"
        echo "  check  - Check refute status"
        echo ""
        echo "Quick test:"
        echo "  1. Start network: shardus start 10"
        echo "  2. Setup problematic: $0 setup"
        echo "  3. Wait 2-3 minutes"
        echo "  4. Check refutes: $0 check"
        ;;
esac