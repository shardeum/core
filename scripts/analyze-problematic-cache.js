#!/usr/bin/env node

/**
 * Script to analyze problematic node cache comparison data from logs
 * Usage: node analyze-problematic-cache.js [log_file]
 */

const fs = require('fs');
const readline = require('readline');

const logFile = process.argv[2] || 'logs/p2p.log';

if (!fs.existsSync(logFile)) {
  console.error(`Log file not found: ${logFile}`);
  process.exit(1);
}

const stats = {
  matches: 0,
  mismatches: 0,
  orderMismatches: 0,
  mismatchDetails: [],
  cyclesAnalyzed: new Set(),
  nodesMismatched: new Set(),
};

const rl = readline.createInterface({
  input: fs.createReadStream(logFile),
  crlfDelay: Infinity
});

console.log(`Analyzing ${logFile}...`);

rl.on('line', (line) => {
  // Look for match logs
  if (line.includes('ProblematicNodeCache match at cycle')) {
    const match = line.match(/cycle (\d+)/);
    if (match) {
      stats.matches++;
      stats.cyclesAnalyzed.add(match[1]);
    }
  }
  
  // Look for mismatch logs
  if (line.includes('ProblematicNodeCache mismatch at cycle')) {
    const cycleMatch = line.match(/cycle (\d+)/);
    if (cycleMatch) {
      stats.mismatches++;
      stats.cyclesAnalyzed.add(cycleMatch[1]);
      
      // Try to extract mismatch details
      const detailsStart = line.indexOf('{');
      if (detailsStart !== -1) {
        try {
          const details = JSON.parse(line.substring(detailsStart));
          stats.mismatchDetails.push({
            cycle: cycleMatch[1],
            ...details
          });
          
          // Track which nodes are involved in mismatches
          if (details.onlyInCurrent) {
            details.onlyInCurrent.forEach(nodeId => stats.nodesMismatched.add(nodeId));
          }
          if (details.onlyInCache) {
            details.onlyInCache.forEach(nodeId => stats.nodesMismatched.add(nodeId));
          }
        } catch (e) {
          // JSON parsing failed, skip
        }
      }
    }
  }
  
  // Look for order mismatch logs
  if (line.includes('ProblematicNodeCache order mismatch at cycle')) {
    const match = line.match(/cycle (\d+)/);
    if (match) {
      stats.orderMismatches++;
      stats.cyclesAnalyzed.add(match[1]);
    }
  }
});

rl.on('close', () => {
  const total = stats.matches + stats.mismatches + stats.orderMismatches;
  
  console.log('\n=== Problematic Node Cache Analysis ===\n');
  
  console.log('Summary:');
  console.log(`  Total comparisons: ${total}`);
  console.log(`  Matches: ${stats.matches} (${((stats.matches / total) * 100).toFixed(2)}%)`);
  console.log(`  Mismatches: ${stats.mismatches} (${((stats.mismatches / total) * 100).toFixed(2)}%)`);
  console.log(`  Order mismatches: ${stats.orderMismatches} (${((stats.orderMismatches / total) * 100).toFixed(2)}%)`);
  console.log(`  Cycles analyzed: ${stats.cyclesAnalyzed.size}`);
  console.log(`  Nodes with mismatches: ${stats.nodesMismatched.size}`);
  
  if (stats.mismatchDetails.length > 0) {
    console.log('\nMismatch Details:');
    console.log(`  Found ${stats.mismatchDetails.length} detailed mismatch records`);
    
    // Show last 5 mismatches
    console.log('\n  Recent mismatches:');
    stats.mismatchDetails.slice(-5).forEach(detail => {
      console.log(`    Cycle ${detail.cycle}:`);
      if (detail.onlyInCurrent?.length > 0) {
        console.log(`      Only in current: ${detail.onlyInCurrent.join(', ')}`);
      }
      if (detail.onlyInCache?.length > 0) {
        console.log(`      Only in cache: ${detail.onlyInCache.join(', ')}`);
      }
    });
    
    // Node frequency analysis
    const nodeFrequency = {};
    stats.nodesMismatched.forEach(nodeId => {
      nodeFrequency[nodeId] = stats.mismatchDetails.filter(d => 
        (d.onlyInCurrent && d.onlyInCurrent.includes(nodeId)) ||
        (d.onlyInCache && d.onlyInCache.includes(nodeId))
      ).length;
    });
    
    const sortedNodes = Object.entries(nodeFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    if (sortedNodes.length > 0) {
      console.log('\n  Most frequently mismatched nodes:');
      sortedNodes.forEach(([nodeId, count]) => {
        console.log(`    ${nodeId}: ${count} mismatches`);
      });
    }
  }
  
  if (total === 0) {
    console.log('\nNo comparison data found in logs.');
    console.log('Make sure:');
    console.log('1. enableProblematicNodeCacheBuilding is true');
    console.log('2. useProblematicNodeCacheV2 is false (shadow mode)');
    console.log('3. The network has been running long enough to generate comparisons');
  }
});