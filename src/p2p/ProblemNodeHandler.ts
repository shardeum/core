import { P2P } from '@shardus/types'
import * as NodeList from './NodeList'
import { config } from './Context'
import { Node } from '@shardus/types/build/src/p2p/NodeListTypes';

export function isNodeProblematic(node: Node, currentCycle: number): boolean {
  if (!node.refuteCycles) return false;

  // Check consecutive refutes
  const refuteCyclesArray = Array.from(node.refuteCycles as Set<number>).sort((a: number, b: number) => a - b);
  const consecutiveRefutes = getConsecutiveRefutes(refuteCyclesArray, currentCycle);
  
  if (consecutiveRefutes >= config.p2p.problematicNodeConsecutiveRefuteThreshold) {
    return true;
  }

  // Check refute percentage in recent history
  const refutePercentage = getRefutePercentage(node.refuteCycles, currentCycle);
  if (refutePercentage >= config.p2p.problematicNodeRefutePercentageThreshold) {
    return true;
  }

  return false;
}

export function getConsecutiveRefutes(refuteCycles: number[], currentCycle: number): number {
  if (refuteCycles.length === 0) return 0;
  
  // Filter to only include refutes up to current cycle
  const relevantRefutes = refuteCycles.filter(cycle => cycle <= currentCycle);
  if (relevantRefutes.length === 0) return 0;
  
  // Find the longest consecutive sequence that ends at current cycle or one before
  let maxCount = 0;
  let currentCount = 1;
  let lastCycle = relevantRefutes[0];
  
  for (let i = 1; i < relevantRefutes.length; i++) {
    const cycle = relevantRefutes[i];
    
    if (cycle === lastCycle + 1) {
      currentCount++;
    } else {
      // If sequence breaks, check if previous sequence ended at current cycle or one before
      if (lastCycle === currentCycle || lastCycle === currentCycle - 1) {
        maxCount = Math.max(maxCount, currentCount);
      }
      currentCount = 1;
    }
    
    lastCycle = cycle;
  }
  
  // Check the last sequence
  if (lastCycle === currentCycle || lastCycle === currentCycle - 1) {
    maxCount = Math.max(maxCount, currentCount);
  }
  
  return maxCount;
}

export function getRefutePercentage(refuteCycles: Set<number>, currentCycle: number): number {
  const windowStart = Math.max(1, currentCycle - config.p2p.problematicNodeHistoryLength + 1);
  const windowSize = Math.min(config.p2p.problematicNodeHistoryLength, currentCycle);
  const recentRefutes = Array.from(refuteCycles)
    .filter(cycle => cycle >= windowStart && cycle <= currentCycle).length;
  
  return recentRefutes / windowSize;
}

export function getProblematicNodes(prevRecord: P2P.CycleCreatorTypes.CycleRecord): string[] {
  const problematicNodes = new Set<string>();
  
  for (const node of NodeList.activeByIdOrder) {
    if (isNodeProblematic(node as Node, prevRecord.counter)) {
      problematicNodes.add(node.id);
    }
  }

  // Sort by refute percentage
  return Array.from(problematicNodes).sort((a, b) => {
    const nodeA = NodeList.nodes.get(a) as Node;
    const nodeB = NodeList.nodes.get(b) as Node;
    const percentageA = getRefutePercentage(nodeA.refuteCycles, prevRecord.counter);
    const percentageB = getRefutePercentage(nodeB.refuteCycles, prevRecord.counter);
    return percentageB - percentageA;
  });
} 