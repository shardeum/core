#!/bin/bash

# Script specifically designed to create nodes that will accumulate refutes
# These nodes have issues but still try to stay in the network

echo "=== Problematic Node Refute Simulator ==="
echo "This script creates nodes that will be marked as lost but refute that status"
echo ""

# Default settings for nodes that will refute
DEFAULT_HOST="localhost"
DEFAULT_MISS_CONSENSUS="0.4"    # Miss 40% of consensus
DEFAULT_NETWORK_DELAY="2500"     # 2.5 second delay
DEFAULT_DROP_MESSAGES="0.25"     # 25% packet loss
DEFAULT_SLOW_RESPONSE="0.3"      # 30% chance of slow response
DEFAULT_SLOW_DELAY="3000"        # 3 second slow response

function create_refute_node {
    local port=$1
    local preset=$2
    
    echo "Configuring node on port $port to accumulate refutes..."
    
    case "$preset" in
        "laggy")
            # High latency node - will miss timing windows
            echo "  Setting as LAGGY node (high network latency)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?enable=true&missConsensus=0.5&networkDelay=4000&dropMessages=0.1&slowResponse=0.4&slowDelayMs=5000" > /dev/null
            ;;
            
        "flaky-network")
            # Intermittent network issues
            echo "  Setting as FLAKY NETWORK node (packet loss + delays)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?enable=true&missConsensus=0.3&networkDelay=1500&dropMessages=0.4&slowResponse=0.5&slowDelayMs=2000" > /dev/null
            ;;
            
        "slow-cpu")
            # Simulates overloaded/slow CPU
            echo "  Setting as SLOW CPU node (processing delays)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?enable=true&missConsensus=0.35&networkDelay=500&dropMessages=0.05&slowResponse=0.7&slowDelayMs=4000" > /dev/null
            ;;
            
        "unstable")
            # Generally unstable node
            echo "  Setting as UNSTABLE node (various issues)"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?enable=true&missConsensus=0.45&networkDelay=2000&dropMessages=0.3&slowResponse=0.4&slowDelayMs=3000" > /dev/null
            ;;
            
        *)
            # Default problematic settings
            echo "  Setting as DEFAULT problematic node"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?enable=true&missConsensus=${DEFAULT_MISS_CONSENSUS}&networkDelay=${DEFAULT_NETWORK_DELAY}&dropMessages=${DEFAULT_DROP_MESSAGES}&slowResponse=${DEFAULT_SLOW_RESPONSE}&slowDelayMs=${DEFAULT_SLOW_DELAY}" > /dev/null
            ;;
    esac
    
    # Also add some traditional debug delays
    curl -s "http://${DEFAULT_HOST}:${port}/debug-network-delay?delay=1000" > /dev/null
    
    echo "  ✓ Node configured"
    echo ""
}

function monitor_refutes {
    local check_port=${1:-9001}
    
    echo "Monitoring refute accumulation (checking via port $check_port)..."
    echo "Press Ctrl+C to stop"
    echo ""
    
    while true; do
        clear
        echo "=== Refute Accumulation Monitor ==="
        echo "Time: $(date)"
        echo "=================================="
        echo ""
        
        # Get problematic node data
        response=$(curl -s "http://${DEFAULT_HOST}:${check_port}/debug_problemNodeTrackerDump")
        
        if [ $? -eq 0 ]; then
            # Parse and display nodes with refutes
            echo "$response" | jq -r '.data.nodeHistories | 
                to_entries[] | 
                select(.value.refuteCycles | length > 0) | 
                "Node ID: \(.key)
                Refute Cycles: \(.value.refuteCycles | join(", "))
                Total Refutes: \(.value.refuteCycles | length)
                Consecutive Refutes: \(.value.stats.consecutiveRefutes)
                Refute Percentage: \(.value.stats.refutePercentage * 100)%
                Is Problematic: \(.value.stats.isProblematic)
                ----------------------------------------"' 2>/dev/null || echo "No refute data yet..."
            
            # Show current cycle
            current_cycle=$(echo "$response" | jq -r '.data.cycle' 2>/dev/null)
            echo ""
            echo "Current Cycle: $current_cycle"
            
            # Show shadow mode stats if available
            shadow_stats=$(echo "$response" | jq '.data.shadowModeStats' 2>/dev/null)
            if [ "$shadow_stats" != "null" ] && [ -n "$shadow_stats" ]; then
                echo ""
                echo "Shadow Mode Comparison:"
                echo "$shadow_stats" | jq -r '"  Matches: \(.matches)
                  Mismatches: \(.mismatches)
                  Match Rate: \(.matchRate * 100)%"' 2>/dev/null
            fi
        else
            echo "Failed to connect to node at ${DEFAULT_HOST}:${check_port}"
        fi
        
        sleep 5
    done
}

# Main script
case "${1:-help}" in
    "setup")
        # Setup multiple problematic nodes
        echo "Setting up problematic nodes that will accumulate refutes..."
        echo ""
        
        # Create different types of problematic nodes
        create_refute_node 9001 "laggy"
        create_refute_node 9002 "flaky-network"
        create_refute_node 9003 "slow-cpu"
        create_refute_node 9004 "unstable"
        
        echo "Setup complete! These nodes should start accumulating refutes."
        echo "Monitor with: $0 monitor"
        ;;
        
    "single")
        # Setup single node
        port=${2:-9001}
        preset=${3:-default}
        create_refute_node "$port" "$preset"
        ;;
        
    "monitor")
        # Monitor refute accumulation
        port=${2:-9001}
        monitor_refutes "$port"
        ;;
        
    "reset")
        # Reset nodes
        echo "Resetting nodes to normal behavior..."
        for port in 9001 9002 9003 9004; do
            echo "  Resetting port $port"
            curl -s "http://${DEFAULT_HOST}:${port}/debug_simulateProblematic?enable=false" > /dev/null
            curl -s "http://${DEFAULT_HOST}:${port}/debug-network-delay?delay=0" > /dev/null
        done
        echo "Done!"
        ;;
        
    *)
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  setup              - Configure nodes 9001-9004 as problematic"
        echo "  single PORT TYPE   - Configure single node (types: laggy, flaky-network, slow-cpu, unstable)"
        echo "  monitor [PORT]     - Monitor refute accumulation (default: 9001)"
        echo "  reset              - Reset all nodes to normal"
        echo ""
        echo "Examples:"
        echo "  $0 setup                    # Setup 4 problematic nodes"
        echo "  $0 single 9005 laggy        # Make port 9005 a laggy node"
        echo "  $0 monitor                  # Monitor refutes"
        echo ""
        echo "How it works:"
        echo "  1. Nodes are configured to have network/performance issues"
        echo "  2. Other nodes will mark them as 'lost' due to missed consensus"
        echo "  3. The problematic nodes will refute their lost status"
        echo "  4. Refutes accumulate in cycle records"
        echo "  5. After enough refutes, nodes are marked as problematic"
        ;;
esac