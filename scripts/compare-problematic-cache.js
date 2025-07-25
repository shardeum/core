#!/usr/bin/env node

/**
 * Compare problematic node cache across all active nodes
 * Usage: node compare-problematic-cache.js <archiver_url>
 * Example: node compare-problematic-cache.js localhost:4000
 */

const http = require('http')
const zlib = require('zlib')
const util = require('util')
const gunzip = util.promisify(zlib.gunzip)

// Colors for console output
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

// Get node info with debug data
async function getNodeDebugInfo(ip, port) {
  const url = `http://${ip}:${port}/nodeInfo?debug=true`
  const info = await httpGet(url)

  if (!info || !info.nodeInfo) {
    return null
  }

  return {
    id: info.nodeInfo.id?.substring(0, 8) || 'unknown',
    fullId: info.nodeInfo.id || 'unknown',
    address: `${ip}:${port}`,
    status: info.nodeInfo.status || 'unknown',
    currentCycle: info.debug?.newestCycle?.counter || 0,
    uptimeMins: info.debug?.uptimeMins || 0,
  }
}

// Get problematic node cache export
async function getProblematicNodeCache(ip, port) {
  const url = `http://${ip}:${port}/debug_problematicNodeCacheExport`
  const response = await httpGet(url)

  if (!response || !response.success || !response.data?.cache) {
    return null
  }

  try {
    // Decompress the cache data
    const compressed = Buffer.from(response.data.cache, 'base64')
    const decompressed = await gunzip(compressed)
    const cacheData = JSON.parse(decompressed.toString())

    return {
      timestamp: response.data.timestamp,
      cache: cacheData,
    }
  } catch (e) {
    console.error(`Error decompressing cache from ${ip}:${port}:`, e.message)
    return null
  }
}

// Get current problematic nodes
async function getProblematicNodes(ip, port) {
  const url = `http://${ip}:${port}/debug_getProblematicNodes`
  const response = await httpGet(url)

  if (!response || !response.success) {
    return null
  }

  return response.data
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

// Get active nodes - first from archiver, then verify with an active validator
async function getActiveNodes(archiverUrl) {
  // First, get the initial list from the archiver
  const archiverNodes = await getActiveNodesFromArchiver(archiverUrl)

  if (!archiverNodes || archiverNodes.length === 0) {
    console.log(`${colors.yellow}No nodes found in archiver${colors.reset}`)
    return null
  }

  console.log(`Found ${archiverNodes.length} nodes in archiver list, finding an active validator...`)

  // Find the first node that is actually active
  let activeValidator = null
  for (const node of archiverNodes) {
    const status = await checkNodeStatus(node)
    if (status === 'active') {
      activeValidator = node
      console.log(`Found active validator: ${node.id ? node.id.substring(0, 8) : node.ip}:${node.port}`)
      break
    }
  }

  if (!activeValidator) {
    console.log(
      `${colors.yellow}Warning: No active validators found in archiver list, using archiver list anyway${colors.reset}`
    )
    return archiverNodes
  }

  // Get the active nodes list from the active validator
  const validatorHost = `${activeValidator.ip}:${activeValidator.port}`
  console.log(`Querying validator for active nodes list...`)
  const validatorNodes = await getActiveNodesFromValidator(validatorHost)

  if (validatorNodes && validatorNodes.length > 0) {
    console.log(`${colors.green}Got ${validatorNodes.length} active nodes from validator${colors.reset}`)
    return validatorNodes
  } else {
    console.log(`${colors.yellow}Could not get node list from validator, falling back to archiver list${colors.reset}`)
    return archiverNodes
  }
}

// Analyze cache data
function analyzeCache(cacheData) {
  if (!cacheData) {
    return null
  }

  // Handle both version 1 and version 2 cache formats
  const isV2 = cacheData.version === 2 && cacheData.processedCycles

  const nodeIds = cacheData.refuteHistory ? Object.keys(cacheData.refuteHistory) : []
  const totalRefutes = cacheData.refuteHistory
    ? Object.values(cacheData.refuteHistory).reduce((sum, cycles) => sum + cycles.length, 0)
    : 0

  // For V2, use processedCycles for total cycle count
  let totalCyclesProcessed = 0
  let cycleRange = null
  let missingCycles = []

  if (isV2) {
    totalCyclesProcessed = cacheData.processedCycles.length
    cycleRange = cacheData.cycleRange

    // Find missing cycles in the range
    if (cycleRange) {
      const processedSet = new Set(cacheData.processedCycles)
      for (let i = cycleRange.min; i <= cycleRange.max; i++) {
        if (!processedSet.has(i)) {
          missingCycles.push(i)
        }
      }
    }
  } else {
    // For V1, count unique cycles from refute history
    const uniqueCycles = new Set()
    if (cacheData.refuteHistory) {
      for (const cycles of Object.values(cacheData.refuteHistory)) {
        for (const cycle of cycles) {
          uniqueCycles.add(cycle)
        }
      }
    }
    totalCyclesProcessed = uniqueCycles.size

    if (uniqueCycles.size > 0) {
      const cycles = Array.from(uniqueCycles)
      cycleRange = {
        min: Math.min(...cycles),
        max: Math.max(...cycles),
      }
    }
  }

  // Count cycles with refutes
  const cyclesWithRefutes = new Set()
  if (cacheData.refuteHistory) {
    for (const cycles of Object.values(cacheData.refuteHistory)) {
      for (const cycle of cycles) {
        cyclesWithRefutes.add(cycle)
      }
    }
  }

  return {
    version: cacheData.version || 1,
    nodeCount: nodeIds.length,
    totalRefutes: totalRefutes,
    cycleRange: cycleRange,
    totalCyclesProcessed: totalCyclesProcessed,
    cyclesWithRefutes: cyclesWithRefutes.size,
    missingCycles: missingCycles,
  }
}

// Compare two caches
function compareCaches(cache1, cache2) {
  const nodes1 = new Set(Object.keys(cache1.refuteHistory))
  const nodes2 = new Set(Object.keys(cache2.refuteHistory))

  const onlyIn1 = [...nodes1].filter((n) => !nodes2.has(n))
  const onlyIn2 = [...nodes2].filter((n) => !nodes1.has(n))
  const inBoth = [...nodes1].filter((n) => nodes2.has(n))

  let differentRefutes = 0
  for (const nodeId of inBoth) {
    const cycles1 = cache1.refuteHistory[nodeId].sort((a, b) => a - b)
    const cycles2 = cache2.refuteHistory[nodeId].sort((a, b) => a - b)

    if (JSON.stringify(cycles1) !== JSON.stringify(cycles2)) {
      differentRefutes++
    }
  }

  return {
    onlyIn1: onlyIn1.length,
    onlyIn2: onlyIn2.length,
    inBoth: inBoth.length,
    differentRefutes,
    identical: onlyIn1.length === 0 && onlyIn2.length === 0 && differentRefutes === 0,
  }
}

// Main function
async function main(archiverUrl) {
  console.log(`${colors.bright}${colors.blue}Shardus Problematic Node Cache Comparison${colors.reset}`)
  console.log(`${colors.cyan}${'━'.repeat(50)}${colors.reset}`)
  console.log(`Archiver: ${colors.green}${archiverUrl}${colors.reset}\n`)

  // Get all active nodes
  console.log(`${colors.blue}Discovering active nodes...${colors.reset}`)
  const nodes = await getActiveNodes(archiverUrl)

  if (!nodes || nodes.length === 0) {
    console.log(`${colors.red}No active nodes found${colors.reset}`)
    return
  }

  console.log(`${colors.green}Found ${nodes.length} active node(s)${colors.reset}\n`)

  // Get cache from each node
  console.log(`${colors.blue}Retrieving problematic node cache from each node...${colors.reset}`)

  const results = []
  let successCount = 0

  // Get problematic nodes from the first available node
  let problematicNodesData = null

  for (const node of nodes) {
    const nodeId = node.id ? node.id.substring(0, 8) : `${node.ip}:${node.port}`
    process.stdout.write(`\rChecking node ${nodeId}... `)

    // Try to get problematic nodes data from the first available node
    if (!problematicNodesData) {
      problematicNodesData = await getProblematicNodes(node.ip, node.port)
    }

    const cacheData = await getProblematicNodeCache(node.ip, node.port)

    if (cacheData) {
      successCount++
      const analysis = analyzeCache(cacheData.cache)
      results.push({
        node: {
          id: nodeId,
          fullId: node.id || 'unknown',
          address: `${node.ip}:${node.port}`,
          status: 'active',
        },
        cache: cacheData.cache,
        analysis,
        timestamp: cacheData.timestamp,
      })
    } else {
      results.push({
        node: {
          id: nodeId,
          fullId: node.id || 'unknown',
          address: `${node.ip}:${node.port}`,
          status: 'active',
        },
        cache: null,
        analysis: null,
        timestamp: null,
      })
    }
  }

  console.log(
    `\r${colors.green}Successfully retrieved cache from ${successCount}/${nodes.length} nodes${colors.reset}\n`
  )

  // Display problematic nodes info if available
  if (problematicNodesData) {
    console.log(`${colors.blue}Problematic Nodes Status:${colors.reset}`)
    console.log(`${colors.cyan}${'━'.repeat(50)}${colors.reset}`)
    console.log(`Current cycle: ${colors.cyan}${problematicNodesData.currentCycle}${colors.reset}`)
    console.log(`Total active nodes: ${colors.cyan}${problematicNodesData.totalActiveNodes}${colors.reset}`)
    console.log(
      `Eviction enabled: ${problematicNodesData.evictionEnabled ? colors.green + 'Yes' : colors.red + 'No'}${
        colors.reset
      }`
    )
    console.log(`\nThresholds:`)
    console.log(
      `  - Consecutive refutes: ${colors.yellow}${problematicNodesData.thresholds.consecutiveRefutes}${colors.reset}`
    )
    console.log(
      `  - Refute percentage: ${colors.yellow}${problematicNodesData.thresholds.refutePercentage * 100}%${colors.reset}`
    )
    console.log(
      `  - History length: ${colors.yellow}${problematicNodesData.thresholds.historyLength} cycles${colors.reset}`
    )

    console.log(
      `\n${colors.bright}Nodes that would qualify as problematic: ${colors.red}${problematicNodesData.problematicNodesCount}${colors.reset}`
    )

    if (problematicNodesData.problematicNodes.length > 0) {
      console.log(`\nProblematic nodes details:`)
      for (const node of problematicNodesData.problematicNodes) {
        console.log(
          `  - Node ${colors.yellow}${node.id}${colors.reset}: ${node.consecutiveRefutes} consecutive refutes, ${node.refutePercentage}% refute rate`
        )
      }
    }
    console.log()
  }

  // Display individual node results
  console.log(`${colors.blue}Node Cache Status:${colors.reset}`)
  console.log(`${colors.cyan}${'━'.repeat(50)}${colors.reset}`)

  for (const result of results) {
    const { node, analysis } = result

    console.log(`\nNode ${colors.yellow}${node.id}${colors.reset} @ ${node.address}`)

    if (analysis) {
      console.log(`  Cache Status: ${colors.green}✓ Available${colors.reset} (v${analysis.version})`)
      console.log(`    - Total cycles processed: ${colors.cyan}${analysis.totalCyclesProcessed}${colors.reset}`)
      console.log(`    - Cycles with refutes: ${colors.yellow}${analysis.cyclesWithRefutes}${colors.reset}`)
      console.log(`    - Nodes with refutes: ${colors.yellow}${analysis.nodeCount}${colors.reset}`)
      console.log(`    - Total refutes: ${colors.yellow}${analysis.totalRefutes}${colors.reset}`)

      if (analysis.cycleRange) {
        console.log(
          `    - Cycle range: ${colors.cyan}${analysis.cycleRange.min} - ${analysis.cycleRange.max}${colors.reset}`
        )

        // Calculate coverage percentage
        const expectedCycles = analysis.cycleRange.max - analysis.cycleRange.min + 1
        const coverage = ((analysis.totalCyclesProcessed / expectedCycles) * 100).toFixed(1)
        console.log(
          `    - Cycle coverage: ${colors.green}${coverage}%${colors.reset} (${analysis.totalCyclesProcessed}/${expectedCycles})`
        )
      }

      if (analysis.missingCycles && analysis.missingCycles.length > 0) {
        console.log(
          `    - ${colors.red}Missing cycles: ${analysis.missingCycles.slice(0, 5).join(', ')}${
            analysis.missingCycles.length > 5 ? '...' : ''
          }${colors.reset}`
        )
      }
    } else {
      console.log(`  Cache Status: ${colors.red}✗ Not available${colors.reset}`)
    }
  }

  // Compare caches if we have multiple
  const validResults = results.filter((r) => r.cache !== null)

  if (validResults.length >= 2) {
    console.log(`\n${colors.cyan}${'━'.repeat(50)}${colors.reset}`)
    console.log(`${colors.bright}${colors.blue}Cache Comparison Results:${colors.reset}\n`)

    // Use first valid cache as reference
    const referenceResult = validResults[0]
    const referenceNode = referenceResult.node

    console.log(`Reference node: ${colors.yellow}${referenceNode.id}${colors.reset}`)
    console.log(`Comparing ${validResults.length - 1} other nodes...\n`)

    let identicalCount = 0
    const discrepancies = []

    for (let i = 1; i < validResults.length; i++) {
      const compareResult = validResults[i]
      const compareNode = compareResult.node

      const comparison = compareCaches(referenceResult.cache, compareResult.cache)

      if (comparison.identical) {
        identicalCount++
      } else {
        discrepancies.push({
          node: compareNode,
          comparison,
        })
      }
    }

    console.log(`${colors.green}Identical caches: ${identicalCount}/${validResults.length - 1}${colors.reset}`)

    if (discrepancies.length > 0) {
      console.log(`\n${colors.red}Discrepancies found:${colors.reset}`)

      for (const disc of discrepancies) {
        console.log(`\nNode ${colors.yellow}${disc.node.id}${colors.reset}:`)
        console.log(`  - Nodes only in reference: ${colors.red}${disc.comparison.onlyIn1}${colors.reset}`)
        console.log(`  - Nodes only in this cache: ${colors.red}${disc.comparison.onlyIn2}${colors.reset}`)
        console.log(
          `  - Nodes with different refutes: ${colors.yellow}${disc.comparison.differentRefutes}${colors.reset}`
        )
      }
    }
  }

  // Summary
  console.log(`\n${colors.cyan}${'━'.repeat(50)}${colors.reset}`)
  console.log(`${colors.bright}Summary:${colors.reset}`)

  console.log(`  Total nodes checked: ${colors.cyan}${nodes.length}${colors.reset}`)
  console.log(`  Nodes with cache available: ${colors.green}${successCount}${colors.reset}`)

  if (validResults.length >= 2) {
    const allIdentical = validResults.every((r, i) => {
      if (i === 0) return true
      const comp = compareCaches(validResults[0].cache, r.cache)
      return comp.identical
    })

    if (allIdentical) {
      console.log(`\n${colors.green}✓ All node caches are identical${colors.reset}`)
    } else {
      console.log(`\n${colors.yellow}⚠ Some nodes have different cache contents${colors.reset}`)
    }
  }

  if (successCount === 0) {
    console.log(`\n${colors.red}⚠ No nodes have problematic node cache enabled${colors.reset}`)
    console.log(`${colors.yellow}Ensure enableProblematicNodeCacheBuilding is set to true${colors.reset}`)
  }

  console.log(`${colors.cyan}${'━'.repeat(50)}${colors.reset}`)
}

// Parse command line arguments
const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Usage: node compare-problematic-cache.js <archiver_url>')
  console.log('Examples:')
  console.log('  node compare-problematic-cache.js localhost:4000')
  console.log('  node compare-problematic-cache.js 127.0.0.1 4000')
  console.log('  node compare-problematic-cache.js http://localhost:4000')
  console.log('\nThe script will connect to the archiver to get the list of active nodes.')
  process.exit(1)
}

let archiverUrl
// Handle both "host port" and "host:port" formats
if (args.length === 2 && !args[0].includes(':')) {
  // Format: host port
  archiverUrl = `http://${args[0]}:${args[1]}`
} else {
  // Format: host:port or full URL
  archiverUrl = args[0]
  // Add http:// if not present
  if (!archiverUrl.startsWith('http://') && !archiverUrl.startsWith('https://')) {
    archiverUrl = `http://${archiverUrl}`
  }
}

// Run the comparison
main(archiverUrl).catch(console.error)
