import { ANOMALY_RECURRENCE_WINDOW_DAYS } from '../config/anomalyRules'
import type { Anomaly } from '../types'

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

export type AnomalyRecurrence = {
  recurrenceCount: number
  relatedAnomalies: Anomaly[]
}

const timestampOf = (value: string) => new Date(value.replace(' ', 'T')).getTime()

/**
 * 复发仅比较同一产线、同一工位、同一异常类型；计数为当前异常之前窗口内的历史发生次数。
 */
export function getAnomalyRecurrence(anomaly: Anomaly, anomalies: Anomaly[]): AnomalyRecurrence {
  const stationName = anomaly.stationName?.trim()
  const anomalyTime = timestampOf(anomaly.startTime)

  if (!stationName || Number.isNaN(anomalyTime)) return { recurrenceCount: 0, relatedAnomalies: [] }

  const windowStart = anomalyTime - ANOMALY_RECURRENCE_WINDOW_DAYS * DAY_IN_MILLISECONDS
  const relatedAnomalies = anomalies
    .filter((candidate) => candidate.id !== anomaly.id)
    .filter((candidate) => candidate.line === anomaly.line && candidate.type === anomaly.type && candidate.stationName?.trim() === stationName)
    .filter((candidate) => {
      const candidateTime = timestampOf(candidate.startTime)
      return !Number.isNaN(candidateTime) && candidateTime >= windowStart && candidateTime < anomalyTime
    })
    .sort((left, right) => timestampOf(right.startTime) - timestampOf(left.startTime))

  return { recurrenceCount: relatedAnomalies.length, relatedAnomalies }
}

