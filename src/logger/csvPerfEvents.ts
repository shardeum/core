import * as fs from 'fs'
import { config } from './../p2p/Context'
import { currentCycle } from '../p2p/CycleCreator'
import { logDir_global } from '../shardus'

const csvFilePath = '/nodePerfEvents.csv'
const perfEventBuffer = []
let numOfEvents = 0

/* eslint-disable security/detect-non-literal-fs-filename */
export function logPerfEvents(eventName: string): void {
  if (config.debug.logCSVPerfEvents) {
    if (fs.existsSync(logDir_global + csvFilePath)) {
      const fileSize = fs.statSync(logDir_global + csvFilePath)?.size
      if (fileSize > 10_485_760) {
        console.log('perf events csv file size is > 10MB!')
        return
      }
    } else {
      const columns = ['timestamp', 'eventName', 'cycleNumber']
      appendToCSV(columns)
    }

    const newRow = [Date.now().toString(), eventName, currentCycle.toString()]

    if (numOfEvents < config.debug.numOfPerfEventsNeededForLogging) {
      appendToCSV(newRow)
      numOfEvents++
    } else if (numOfEvents % config.debug.numOfPerfEventsNeededForLogging === 0) {
      perfEventBuffer.push(newRow)
      for (const event of perfEventBuffer) {
        appendToCSV(event)
      }
      perfEventBuffer.length = 0
      numOfEvents++
    } else {
      perfEventBuffer.push(newRow)
      numOfEvents++
    }
  }
}

function appendToCSV(data: string[]): void {
  const csvRow = data.join(',') + '\n'
  fs.appendFileSync(logDir_global + csvFilePath, csvRow, 'utf8')
}
/* eslint-enable security/detect-non-literal-fs-filename */

export function writeBufferToCSV(): void {
  for (const event of perfEventBuffer) {
    appendToCSV(event)
  }
  perfEventBuffer.length = 0
}
