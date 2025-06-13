#!/bin/bash

# Script to monitor problematic node cache shadow mode on a live network
# Usage: ./monitor-problematic-cache.sh [node_ip] [node_port]

NODE_IP=${1:-localhost}
NODE_PORT=${2:-9001}
INTERVAL=${3:-30}  # Check every 30 seconds by default

echo "Monitoring problematic node cache shadow mode on $NODE_IP:$NODE_PORT"
echo "Checking every $INTERVAL seconds..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    echo "========================================"
    echo "Timestamp: $(date)"
    echo "========================================"
    
    # Get the debug dump
    response=$(curl -s "http://$NODE_IP:$NODE_PORT/debug_problemNodeTrackerDump")
    
    if [ $? -eq 0 ]; then
        # Extract shadow mode stats
        echo "$response" | jq '.data.shadowModeStats' 2>/dev/null
        
        if [ $? -eq 0 ]; then
            # Calculate and display key metrics
            matches=$(echo "$response" | jq '.data.shadowModeStats.matches' 2>/dev/null)
            mismatches=$(echo "$response" | jq '.data.shadowModeStats.mismatches' 2>/dev/null)
            orderMismatches=$(echo "$response" | jq '.data.shadowModeStats.orderMismatches' 2>/dev/null)
            matchRate=$(echo "$response" | jq '.data.shadowModeStats.matchRate' 2>/dev/null)
            
            echo ""
            echo "Summary:"
            echo "  Matches: $matches"
            echo "  Mismatches: $mismatches"
            echo "  Order Mismatches: $orderMismatches"
            echo "  Match Rate: $matchRate"
            
            # Show last mismatch if any
            lastMismatch=$(echo "$response" | jq '.data.shadowModeStats.lastMismatch' 2>/dev/null)
            if [ "$lastMismatch" != "null" ]; then
                echo ""
                echo "Last Mismatch:"
                echo "$lastMismatch" | jq '.'
            fi
        else
            echo "Shadow mode not active or no statistics available"
        fi
        
        # Show current cycle
        currentCycle=$(echo "$response" | jq '.data.cycle' 2>/dev/null)
        echo ""
        echo "Current Cycle: $currentCycle"
    else
        echo "Failed to connect to node at $NODE_IP:$NODE_PORT"
    fi
    
    echo ""
    sleep $INTERVAL
done