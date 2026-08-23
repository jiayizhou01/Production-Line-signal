import type { Anomaly, DailyReport } from '../types'

type Shift = NonNullable<DailyReport['shift']>

export interface StopSegment {
  anomaly: Anomaly
  date: string
  shift: Shift
  start: number
  end: number
}

const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const parseDateTime = (value: string) => new Date(value.replace(' ', 'T'))
export const downtimeKey = (date: string, line: string, shift?: string) => `${date}|${line}|${shift ?? ''}`

function getShiftInfo(time: Date) {
  const dayStart = new Date(time)
  dayStart.setHours(8, 0, 0, 0)
  const nightStart = new Date(time)
  nightStart.setHours(20, 0, 0, 0)

  if (time >= dayStart && time < nightStart) return { shift: '白班' as Shift, date: formatDate(time), boundary: nightStart }
  if (time < dayStart) {
    const workDate = new Date(time)
    workDate.setDate(workDate.getDate() - 1)
    return { shift: '夜班' as Shift, date: formatDate(workDate), boundary: dayStart }
  }

  const boundary = new Date(time)
  boundary.setDate(boundary.getDate() + 1)
  boundary.setHours(8, 0, 0, 0)
  return { shift: '夜班' as Shift, date: formatDate(time), boundary }
}

export function splitStopAnomaly(anomaly: Anomaly): StopSegment[] {
  if (anomaly.impactType === 'nonstop' || anomaly.impactMinutes <= 0) return []
  const start = parseDateTime(anomaly.startTime)
  if (Number.isNaN(start.getTime())) return []
  const suppliedEnd = anomaly.endTime ? parseDateTime(anomaly.endTime) : null
  const end = suppliedEnd && suppliedEnd > start ? suppliedEnd : new Date(start.getTime() + anomaly.impactMinutes * 60_000)
  const segments: StopSegment[] = []
  let cursor = new Date(start)

  while (cursor < end) {
    const shiftInfo = getShiftInfo(cursor)
    const segmentEnd = shiftInfo.boundary < end ? shiftInfo.boundary : end
    segments.push({ anomaly, date: shiftInfo.date, shift: shiftInfo.shift, start: cursor.getTime(), end: segmentEnd.getTime() })
    cursor = new Date(segmentEnd)
  }
  return segments
}

export function mergeStopMinutes(segments: Pick<StopSegment, 'start' | 'end'>[]) {
  const intervals = segments.map(({ start, end }) => [start, end] as const).sort((left, right) => left[0] - right[0])
  let currentStart: number | undefined
  let currentEnd = 0
  let total = 0

  intervals.forEach(([start, end]) => {
    if (currentStart === undefined) {
      currentStart = start
      currentEnd = end
    } else if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end)
    } else {
      total += currentEnd - currentStart
      currentStart = start
      currentEnd = end
    }
  })
  return (total + (currentStart === undefined ? 0 : currentEnd - currentStart)) / 60_000
}

/** Deduplicated abnormal-stop duration for every production date / line / shift. */
export function getAnomalyDowntimeHoursByShift(anomalies: Anomaly[]) {
  const groups = new Map<string, StopSegment[]>()
  anomalies.flatMap(splitStopAnomaly).forEach((segment) => {
    const key = downtimeKey(segment.date, segment.anomaly.line, segment.shift)
    groups.set(key, [...(groups.get(key) ?? []), segment])
  })
  return new Map([...groups].map(([key, segments]) => [key, mergeStopMinutes(segments) / 60]))
}
