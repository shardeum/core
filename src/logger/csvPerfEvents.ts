import * as fs from 'fs'
import { config } from './../p2p/Context'
import { currentCycle } from '../p2p/CycleCreator'
import { logDir_global } from '../shardus'

const csvFilePath = '/nodePerfEvents.csv'
let firstCall = true

export function logPerfEvents(eventName: string): void {
  if (config.debug.logCSVPerfEvents) {
    if (firstCall) {
      const columns = ['timestamp', 'eventName', 'cycleNumber']
      appendToCSV(columns)
      firstCall = false
    }

    const newRow = [Date.now().toString(), eventName, currentCycle.toString()]
    appendToCSV(newRow)

  }
}

function appendToCSV(data: string[]): void {
  const csvRow = data.join(',') + '\n'
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.appendFileSync(logDir_global + csvFilePath, csvRow, 'utf8')
}
