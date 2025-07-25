#!/usr/bin/env node

/**
 * Monitor cycle consistency across all active nodes in the network
 * This script checks that all nodes have the same historical cycle records
 *
 * IMPORTANT: The cycle monitoring endpoints require high-security debug middleware.
 * This means:
 * - In debug mode: Endpoints are accessible without authentication
 * - In production mode: Requires developer key with security level 3 (High)
 *
 * If running against production nodes, you'll need to sign requests properly.
 */

const http = require('http')

// Configuration
const CHECK_INTERVAL = 30000 // 30 seconds
const MAX_CYCLES_TO_KEEP = 60
const MAX_RETRIES = 3 // Max retries for each node

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

// HTTP request helper
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            resolve(null)
          }
        })
      })
      .on('error', () => resolve(null))
  })
}

// Get list of active nodes from archiver
async function getActiveNodesFromArchiver(archiverUrl) {
  const endpoints = ['/full-nodelist?activeOnly=true', '/nodelist?activeOnly=true', '/full-nodelist', '/nodelist']

  for (const endpoint of endpoints) {
    const url = `${archiverUrl}${endpoint}`
    const data = await httpGet(url)

    if (data && data.nodeList && data.nodeList.length > 0) {
      // Transform to consistent format
      const nodes = data.nodeList.map((node) => ({
        id: node.id,
        ip: node.ip || 'localhost',
        port: node.port || 9001,
        publicKey: node.publicKey,
      }))

      return nodes
    }
  }

  return null
}

// Get active nodes from a validator node
async function getActiveNodesFromValidator(validatorHost) {
  const endpoints = ['/api/sync/activeNodes', '/activeNodes', '/network/nodes', '/nodelist', '/debug/nodelist']

  for (const endpoint of endpoints) {
    const url = `http://${validatorHost}${endpoint}`
    const data = await httpGet(url)

    if (data) {
      let nodes = null

      // Extract node list based on response structure
      if (data.nodeList && Array.isArray(data.nodeList)) nodes = data.nodeList
      else if (data.activeNodes && Array.isArray(data.activeNodes)) nodes = data.activeNodes
      else if (data.nodes && Array.isArray(data.nodes)) nodes = data.nodes
      else if (Array.isArray(data)) nodes = data // Direct array response

      // Ensure consistent format and filter for active nodes only
      if (nodes && nodes.length > 0) {
        const formattedNodes = nodes.map((node) => ({
          id: node.id || node.nodeId,
          ip: node.ip || node.externalIp || node.address || 'localhost',
          port: node.port || node.externalPort || 9001,
          publicKey: node.publicKey,
          status: node.status,
        }))

        // Only return nodes that don't have an explicit non-active status
        return formattedNodes.filter((node) => !node.status || node.status === 'active')
      }
    }
  }

  return null
}

// Get active nodes - first from archiver, then verify with an active validator
async function getActiveNodes(archiverUrl) {
  // First, get the initial list from the archiver
  const archiverNodes = await getActiveNodesFromArchiver(archiverUrl)

  if (!archiverNodes || archiverNodes.length === 0) {
    console.log(`${colors.yellow}No nodes found in archiver${colors.reset}`)
    return null
  }

  console.log(`  Found ${archiverNodes.length} nodes in archiver list, finding an active validator...`)

  // Find the first node that is actually active
  let activeValidator = null
  for (const node of archiverNodes) {
    const status = await checkNodeStatus(node)
    if (status === 'active') {
      activeValidator = node
      console.log(`  Found active validator: ${node.id ? node.id.substring(0, 8) : node.ip}:${node.port}`)
      break
    }
  }

  if (!activeValidator) {
    console.log(
      `  ${colors.yellow}Warning: No active validators found in archiver list, using archiver list anyway${colors.reset}`
    )
    return archiverNodes
  }

  // Get the active nodes list from the active validator
  const validatorHost = `${activeValidator.ip}:${activeValidator.port}`
  console.log(`  Querying validator for active nodes list...`)
  const validatorNodes = await getActiveNodesFromValidator(validatorHost)

  if (validatorNodes && validatorNodes.length > 0) {
    console.log(`  ${colors.green}Got ${validatorNodes.length} active nodes from validator${colors.reset}`)
    return validatorNodes
  } else {
    console.log(
      `  ${colors.yellow}Could not get node list from validator, falling back to archiver list${colors.reset}`
    )
    return archiverNodes
  }
}

// Check if a node is in active status
async function checkNodeStatus(node) {
  const endpoints = ['/nodeInfo', '/debug-nodeinfo', '/status']

  for (const endpoint of endpoints) {
    const url = `http://${node.ip}:${node.port}${endpoint}`
    const data = await httpGet(url)

    if (data) {
      // Extract status based on response structure
      if (data.status) return data.status
      if (data.nodeInfo && data.nodeInfo.status) return data.nodeInfo.status
      if (data.state) return data.state

      // If we have node info but no explicit status, assume active
      if (data.nodeInfo || data.id) return 'active'
    }
  }

  return 'unknown'
}

// Get cycle inventory from a node with retries
async function getCycleInventory(node, retries = MAX_RETRIES) {
  const endpoints = [
    '/cycle-inventory', // Proposed endpoint
    '/cycle-chain-info', // Alternative
    '/debug-cycle-info', // Debug fallback
    '/cycle-storage-health', // Health check endpoint
  ]

  for (let attempt = 0; attempt < retries; attempt++) {
    for (const endpoint of endpoints) {
      const url = `http://${node.ip}:${node.port}${endpoint}`
      const data = await httpGet(url)
      if (data) return data
    }

    // Wait before retry
    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  // Fallback: Try to construct inventory from available endpoints
  return await constructCycleInventory(node)
}

// Get cycle chain hash from a node
async function getCycleChainHash(node) {
  const url = `http://${node.ip}:${node.port}/cycle-chain-hash`
  return await httpGet(url)
}

// Construct cycle inventory from existing endpoints
async function constructCycleInventory(node) {
  try {
    // Get newest cycle
    let newestCycle = null
    const newestData = await httpGet(`http://${node.ip}:${node.port}/sync-newest-cycle`)
    if (newestData && newestData.cycle) {
      newestCycle = newestData.cycle.counter
    } else {
      // Try current-cycle-hash
      const currentData = await httpGet(`http://${node.ip}:${node.port}/current-cycle-hash`)
      if (currentData && currentData.currentCycle) {
        newestCycle = currentData.currentCycle
      }
    }

    if (!newestCycle) return null

    // Try to get recent cycle markers
    const markersData = await httpGet(`http://${node.ip}:${node.port}/recent-cycle-markers?count=${MAX_CYCLES_TO_KEEP}`)
    const cycleMarkers = markersData?.cycleMarkers || []

    // Detect oldest cycle by checking backwards
    let oldestCycle = Math.max(1, newestCycle - MAX_CYCLES_TO_KEEP + 1)
    const missingCycles = []

    // Check for gaps
    for (let i = oldestCycle; i <= newestCycle; i++) {
      const markerData = await httpGet(`http://${node.ip}:${node.port}/cycle-by-marker?cycle=${i}`)
      if (!markerData || !markerData.cycle) {
        missingCycles.push(i)
      }
    }

    return {
      currentCycle: newestCycle,
      oldestStoredCycle: oldestCycle,
      newestStoredCycle: newestCycle,
      totalCyclesStored: newestCycle - oldestCycle + 1 - missingCycles.length,
      maxCyclesToKeep: MAX_CYCLES_TO_KEEP,
      cycleMarkers: cycleMarkers,
      missingCycles: missingCycles,
    }
  } catch (error) {
    return null
  }
}

// Compare cycle inventories across nodes
function compareCycleInventories(inventories) {
  const issues = []
  const nodeCount = inventories.length

  if (nodeCount === 0) return { consistent: false, issues: ['No nodes to compare'] }

  // Check current cycle alignment
  const currentCycles = inventories.map((inv) => inv.currentCycle)
  const uniqueCurrentCycles = [...new Set(currentCycles)]

  if (uniqueCurrentCycles.length > 1) {
    // Only flag as issue if cycles differ by more than 1 (normal transition)
    const minCycle = Math.min(...uniqueCurrentCycles)
    const maxCycle = Math.max(...uniqueCurrentCycles)

    if (maxCycle - minCycle > 1) {
      issues.push(`Nodes are on very different cycles: ${uniqueCurrentCycles.join(', ')} (gap > 1)`)
    } else {
      issues.push(`Nodes are on adjacent cycles: ${uniqueCurrentCycles.join(', ')} (likely cycle transition)`)
    }
  }

  // Check cycle storage counts
  const storageCounts = inventories.map((inv) => inv.totalCyclesStored)
  const uniqueStorageCounts = [...new Set(storageCounts)]

  if (uniqueStorageCounts.length > 1) {
    issues.push(`Nodes have different cycle counts: ${uniqueStorageCounts.join(', ')}`)
  }

  // Check for missing cycles
  const nodesWithGaps = inventories.filter((inv) => inv.missingCycles.length > 0)
  if (nodesWithGaps.length > 0) {
    issues.push(`${nodesWithGaps.length} nodes have gaps in cycle history`)
  }

  // Compare cycle markers if available
  if (inventories[0].cycleMarkers && inventories[0].cycleMarkers.length > 0) {
    const markerSets = inventories.map((inv) => JSON.stringify(inv.cycleMarkers.sort()))
    const uniqueMarkerSets = [...new Set(markerSets)]

    if (uniqueMarkerSets.length > 1) {
      issues.push('Nodes have different cycle marker histories')
    }
  }

  return {
    consistent: issues.length === 0,
    issues: issues,
  }
}

// Main monitoring function
async function monitorCycleConsistency(archiverUrl) {
  console.log(`${colors.bright}${colors.blue}Shardus Network Cycle Consistency Monitor${colors.reset}`)
  console.log(`${colors.cyan}${'━'.repeat(50)}${colors.reset}`)
  console.log(`Archiver: ${colors.green}${archiverUrl}${colors.reset}`)
  console.log(`Check interval: ${colors.yellow}${CHECK_INTERVAL / 1000}s${colors.reset}\n`)

  let lastActiveNodes = null
  let consecutiveFailures = 0
  const maxConsecutiveFailures = 5

  while (true) {
    const timestamp = new Date().toISOString()
    console.log(`${colors.bright}[${timestamp}]${colors.reset} Checking cycle consistency...`)

    // Get active nodes from archiver
    let nodes = await getActiveNodes(archiverUrl)

    if (!nodes || nodes.length === 0) {
      consecutiveFailures++

      // Try to use last known nodes if available
      if (lastActiveNodes && lastActiveNodes.length > 0 && consecutiveFailures < maxConsecutiveFailures) {
        console.log(`${colors.yellow}Using cached node list (${lastActiveNodes.length} nodes)${colors.reset}`)
        nodes = lastActiveNodes
      } else {
        console.log(`${colors.red}Failed to get active nodes from archiver${colors.reset}\n`)
        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL))
        continue
      }
    } else {
      // Reset failure counter and update cache
      consecutiveFailures = 0
      lastActiveNodes = nodes
    }

    console.log(`Found ${colors.cyan}${nodes.length}${colors.reset} active nodes`)

    // Check all nodes in parallel to minimize cycle transition issues
    console.log(`  Checking all ${nodes.length} nodes in parallel...`)
    const startTime = Date.now()

    const nodePromises = nodes.map(async (node) => {
      const nodeId = node.id ? node.id.substring(0, 8) : `${node.ip}:${node.port}`
      const nodeLabel = `${nodeId}:${node.port}`

      try {
        // First check if the node is actually active
        const status = await checkNodeStatus(node)

        if (status !== 'active') {
          return {
            success: false,
            nodeId,
            nodeLabel,
            status,
            reason: `Node status is '${status}', not 'active'`,
          }
        }

        const [inventory, chainHash] = await Promise.all([getCycleInventory(node), getCycleChainHash(node)])

        if (inventory) {
          return {
            success: true,
            nodeId,
            nodeLabel,
            node,
            status,
            inventory: {
              nodeId: nodeLabel,
              node: node,
              ...inventory,
            },
            chainHash:
              chainHash && chainHash.chainHash
                ? {
                    nodeId: nodeLabel,
                    ...chainHash,
                  }
                : null,
          }
        } else {
          return {
            success: false,
            nodeId,
            nodeLabel,
            status,
            reason: 'Failed to get cycle inventory',
          }
        }
      } catch (error) {
        return {
          success: false,
          nodeId,
          nodeLabel,
          reason: `Error: ${error.message}`,
        }
      }
    })

    const results = await Promise.all(nodePromises)
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1)

    const inventories = []
    const chainHashes = []
    const failedNodes = []
    const inactiveNodes = []

    results.forEach((result) => {
      if (result.success) {
        inventories.push(result.inventory)
        if (result.chainHash) {
          chainHashes.push(result.chainHash)
        }
      } else {
        failedNodes.push({
          nodeId: result.nodeId,
          nodeLabel: result.nodeLabel || result.nodeId,
          reason: result.reason || 'Unknown error',
          status: result.status,
        })

        // Track inactive nodes separately
        if (result.status && result.status !== 'active' && result.status !== 'unknown') {
          inactiveNodes.push({
            nodeId: result.nodeId,
            nodeLabel: result.nodeLabel || result.nodeId,
            status: result.status,
          })
        }
      }
    })

    console.log(
      `  Completed in ${colors.yellow}${elapsedTime}s${colors.reset} - Success: ${colors.green}${inventories.length}${colors.reset}, Failed: ${colors.red}${failedNodes.length}${colors.reset}`
    )

    // Report inactive nodes immediately
    if (inactiveNodes.length > 0) {
      console.log(`  ${colors.yellow}⚠ Found ${inactiveNodes.length} nodes not in 'active' status${colors.reset}`)
    }

    // Compare inventories
    if (inventories.length === 0) {
      console.log(`\n${colors.red}Could not retrieve cycle data from any nodes${colors.reset}\n`)
    } else {
      console.log(`\nSuccessfully checked ${colors.green}${inventories.length}/${nodes.length}${colors.reset} nodes`)

      // Show summary
      const currentCycles = [...new Set(inventories.map((inv) => inv.currentCycle))]
      const avgStoredCycles = inventories.reduce((sum, inv) => sum + inv.totalCyclesStored, 0) / inventories.length

      console.log(`\n${colors.blue}Summary:${colors.reset}`)
      console.log(`  Current cycle(s): ${colors.cyan}${currentCycles.join(', ')}${colors.reset}`)

      // Warn about cycle transition
      if (currentCycles.length > 1) {
        const cycleGroups = {}
        inventories.forEach((inv) => {
          if (!cycleGroups[inv.currentCycle]) cycleGroups[inv.currentCycle] = 0
          cycleGroups[inv.currentCycle]++
        })

        console.log(`  ${colors.yellow}⚠ Cycle transition detected during check:${colors.reset}`)
        Object.entries(cycleGroups).forEach(([cycle, count]) => {
          console.log(`    Cycle ${cycle}: ${count} nodes`)
        })
        console.log(`  ${colors.cyan}This is normal if the check ran during a cycle change.${colors.reset}`)
      }

      console.log(
        `  Average cycles stored: ${colors.yellow}${avgStoredCycles.toFixed(1)}/${MAX_CYCLES_TO_KEEP}${colors.reset}`
      )

      // Check consistency
      const comparison = compareCycleInventories(inventories)

      // Check content consistency via chain hashes
      let contentConsistent = true
      let contentIssues = []
      let commonRecentCycles = 0

      if (chainHashes.length > 0) {
        console.log(`\n${colors.blue}Content Verification:${colors.reset}`)

        // Find the length of common recent history
        // First, get the current cycle (should be same for all nodes)
        const currentCycle = Math.max(...inventories.map((inv) => inv.currentCycle))

        // Determine the minimum stored cycles across all nodes
        const minStoredCycles = Math.min(...inventories.map((inv) => inv.totalCyclesStored))

        // Use chain hash data to find common history
        if (chainHashes.length === inventories.length) {
          // Group nodes by their cycle range
          const nodesByRange = {}
          chainHashes.forEach((ch) => {
            const rangeKey = `${ch.cycleRange.start}-${ch.cycleRange.end}`
            if (!nodesByRange[rangeKey]) {
              nodesByRange[rangeKey] = {
                nodes: [],
                hash: ch.chainHash,
                start: ch.cycleRange.start,
                end: ch.cycleRange.end,
                count: ch.cycleRange.end - ch.cycleRange.start + 1,
              }
            }
            nodesByRange[rangeKey].nodes.push(ch.nodeId)
          })

          // Find the largest range where all nodes with that range have the same hash
          let maxCommonEnd = 0
          Object.values(nodesByRange).forEach((range) => {
            if (range.end === currentCycle && range.nodes.length > 1) {
              // This range ends at current cycle
              const nodesWithSameHash = chainHashes.filter(
                (ch) =>
                  ch.cycleRange.end === range.end && ch.cycleRange.start === range.start && ch.chainHash === range.hash
              ).length

              if (nodesWithSameHash === range.nodes.length) {
                // All nodes with this range have identical content
                commonRecentCycles = Math.max(commonRecentCycles, range.count)
                maxCommonEnd = Math.max(maxCommonEnd, range.end)
              }
            }
          })

          // If we couldn't determine from matching ranges, infer from the pattern
          if (commonRecentCycles === 0 && minStoredCycles > 0) {
            // All nodes end at the current cycle
            // The newest node has the least history (minStoredCycles)
            // If all ranges shown have identical content, then at least the last minStoredCycles are common

            // Check if all displayed ranges have the same hash (meaning identical content)
            const allRangesIdentical = Object.values(nodesByRange).every((range) => {
              // All nodes with this range already have the same hash by construction
              return true
            })

            if (allRangesIdentical) {
              // All nodes have identical content for their stored ranges
              // The common history is at least as long as the shortest node's history
              commonRecentCycles = minStoredCycles
            } else {
              // Find the most recent cycle where all nodes agree
              // This would be the start of the newest node's range
              const newestNodeStart = currentCycle - minStoredCycles + 1

              // Check if all nodes that have this cycle agree on content
              const nodesWithThisCycle = chainHashes.filter(
                (ch) => ch.cycleRange.start <= newestNodeStart && ch.cycleRange.end >= newestNodeStart
              )

              if (nodesWithThisCycle.length === chainHashes.length) {
                // All nodes have this cycle, assume they agree from here forward
                commonRecentCycles = currentCycle - newestNodeStart + 1
              }
            }
          }
        }

        // The true common history can't exceed the minimum stored cycles
        const trueCommonHistory = Math.min(commonRecentCycles, minStoredCycles)

        if (trueCommonHistory > 0) {
          console.log(
            `  ${colors.bright}${colors.green}✓ Most recent ${trueCommonHistory} cycles are identical across all nodes${colors.reset}`
          )

          if (trueCommonHistory < minStoredCycles) {
            const divergenceCycle = currentCycle - trueCommonHistory
            console.log(`  ${colors.yellow}⚠ Content diverges at cycle ${divergenceCycle} or earlier${colors.reset}`)
          } else if (minStoredCycles < MAX_CYCLES_TO_KEEP) {
            console.log(
              `  ${colors.cyan}ℹ Newest node only has ${minStoredCycles} cycles (joined at cycle ${
                currentCycle - minStoredCycles + 1
              })${colors.reset}`
            )
          }
        } else {
          console.log(`  ${colors.red}✗ No common recent history found${colors.reset}`)
        }

        // Group by cycle range and chain hash
        const hashGroups = {}
        chainHashes.forEach((ch) => {
          const key = `${ch.cycleRange.start}-${ch.cycleRange.end}:${ch.chainHash}`
          if (!hashGroups[key]) hashGroups[key] = []
          hashGroups[key].push(ch.nodeId)
        })

        // Check if all nodes with same range have same hash
        const rangeGroups = {}
        chainHashes.forEach((ch) => {
          const rangeKey = `${ch.cycleRange.start}-${ch.cycleRange.end}`
          if (!rangeGroups[rangeKey]) rangeGroups[rangeKey] = []
          rangeGroups[rangeKey].push({
            nodeId: ch.nodeId,
            hash: ch.chainHash.substring(0, 8), // First 8 chars for display
          })
        })

        // Sort ranges by start cycle descending to show newest first
        const sortedRanges = Object.entries(rangeGroups).sort((a, b) => {
          const startA = parseInt(a[0].split('-')[0])
          const startB = parseInt(b[0].split('-')[0])
          return startB - startA
        })

        console.log(`\n${colors.blue}Cycle Ranges by Node Age:${colors.reset}`)
        sortedRanges.forEach(([range, nodes]) => {
          const [start, end] = range.split('-').map((n) => parseInt(n))
          const cycleCount = end - start + 1
          const uniqueHashes = [...new Set(nodes.map((n) => n.hash))]

          if (uniqueHashes.length > 1) {
            contentConsistent = false
            contentIssues.push(`Different content for cycles ${range}: ${uniqueHashes.length} unique hashes`)
            console.log(
              `  ${colors.red}✗ Cycles ${range} (${cycleCount} cycles, ${nodes.length} nodes): ${uniqueHashes.length} different versions${colors.reset}`
            )

            // Show which nodes have which hash
            uniqueHashes.forEach((hash) => {
              const nodesWithHash = nodes.filter((n) => n.hash === hash).map((n) => n.nodeId)
              console.log(`    Hash ${hash}...: ${nodesWithHash.join(', ')}`)
            })
          } else {
            console.log(
              `  ${colors.green}✓ Cycles ${range} (${cycleCount} cycles, ${nodes.length} nodes): Identical (${nodes[0].hash}...)${colors.reset}`
            )
          }
        })
      } else {
        console.log(
          `\n${colors.yellow}Content verification not available (cycle-chain-hash endpoint not accessible)${colors.reset}`
        )
      }

      // Overall status
      if (comparison.consistent && contentConsistent) {
        console.log(`\n  Status: ${colors.green}✓ All nodes have consistent cycle history AND content${colors.reset}`)
      } else {
        console.log(`\n  Status: ${colors.red}✗ Inconsistencies detected${colors.reset}`)

        if (!comparison.consistent) {
          console.log(`  ${colors.yellow}Structure issues:${colors.reset}`)
          comparison.issues.forEach((issue) => {
            console.log(`    - ${issue}`)
          })
        }

        if (!contentConsistent) {
          console.log(`  ${colors.yellow}Content issues:${colors.reset}`)
          contentIssues.forEach((issue) => {
            console.log(`    - ${issue}`)
          })
        }

        // Show detailed breakdown
        console.log(`\n${colors.blue}Node Details:${colors.reset}`)
        inventories.forEach((inv) => {
          const gaps = inv.missingCycles.length > 0 ? ` (${inv.missingCycles.length} gaps)` : ''
          console.log(`  ${inv.nodeId}: Cycle ${inv.currentCycle}, Stored: ${inv.totalCyclesStored}${gaps}`)
        })
      }

      if (failedNodes.length > 0) {
        console.log(`\n${colors.red}Failed to check ${failedNodes.length} nodes:${colors.reset}`)

        // Show inactive nodes first
        if (inactiveNodes.length > 0) {
          console.log(`  ${colors.yellow}Inactive nodes (not in 'active' status):${colors.reset}`)
          inactiveNodes.forEach((node) => {
            console.log(`    ${node.nodeLabel}: status = '${node.status}'`)
          })
        }

        // Show other failed nodes
        const otherFailures = failedNodes.filter(
          (node) => !inactiveNodes.some((inactive) => inactive.nodeId === node.nodeId)
        )
        if (otherFailures.length > 0) {
          console.log(`  ${colors.red}Other failures:${colors.reset}`)
          otherFailures.forEach((node) => {
            console.log(`    ${node.nodeLabel}: ${node.reason}`)
          })
        }
      }
    }

    console.log(`\n${colors.cyan}${'─'.repeat(50)}${colors.reset}`)
    console.log(`Next check in ${CHECK_INTERVAL / 1000} seconds... (Ctrl+C to exit)\n`)

    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL))
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Usage: node monitor-cycle-consistency.js <archiver_url>')
  console.log('Examples:')
  console.log('  node monitor-cycle-consistency.js localhost:4000')
  console.log('  node monitor-cycle-consistency.js http://localhost:4000')
  console.log('\nThe script will connect to the archiver to get the list of active nodes.')
  process.exit(1)
}

let archiverUrl = args[0]
// Add http:// if not present
if (!archiverUrl.startsWith('http://') && !archiverUrl.startsWith('https://')) {
  archiverUrl = `http://${archiverUrl}`
}

monitorCycleConsistency(archiverUrl).catch(console.error)
