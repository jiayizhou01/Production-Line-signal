export type NavigationMetric = 'ct' | 'achievement' | 'oee' | 'upph' | 'yield' | 'labor-gap' | 'downtime' | 'downturn'

export type NavigationContext = {
  startDate?: string
  endDate?: string
  date?: string
  line?: string
  shift?: '白班' | '夜班'
  station?: string
  anomalyId?: string
  reportId?: string
  metric?: NavigationMetric
  source?: string
}

const contextKeys = ['startDate', 'endDate', 'date', 'line', 'shift', 'station', 'anomalyId', 'reportId', 'metric', 'source'] as const
const metricValues: NavigationMetric[] = ['ct', 'achievement', 'oee', 'upph', 'yield', 'labor-gap', 'downtime', 'downturn']
const isDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()))

export function readNavigationContext(params: URLSearchParams, options: { lines?: string[]; stations?: string[] } = {}) {
  const invalid: string[] = []
  const context: NavigationContext = {}
  const readDate = (key: 'startDate' | 'endDate' | 'date') => {
    const value = params.get(key)
    if (!value) return
    if (isDate(value)) context[key] = value
    else invalid.push(key)
  }

  readDate('startDate')
  readDate('endDate')
  readDate('date')
  if (context.startDate && context.endDate && context.startDate > context.endDate) {
    delete context.startDate
    delete context.endDate
    invalid.push('日期范围')
  }

  const line = params.get('line')
  if (line) {
    if (!options.lines?.length || options.lines.includes(line)) context.line = line
    else invalid.push('产线')
  }
  const shift = params.get('shift')
  if (shift) {
    if (shift === '白班' || shift === '夜班') context.shift = shift
    else invalid.push('班次')
  }
  const station = params.get('station')
  if (station) {
    if (!options.stations?.length || options.stations.includes(station)) context.station = station
    else invalid.push('工位')
  }
  const anomalyId = params.get('anomalyId')
  if (anomalyId) context.anomalyId = anomalyId
  const reportId = params.get('reportId')
  if (reportId) context.reportId = reportId
  const metric = params.get('metric')
  if (metric) {
    if (metricValues.includes(metric as NavigationMetric)) context.metric = metric as NavigationMetric
    else invalid.push('指标')
  }
  const source = params.get('source')
  if (source) context.source = source

  return { context, invalid }
}

export function updateNavigationContext(current: URLSearchParams, updates: Record<string, string | undefined>) {
  const next = new URLSearchParams(current)
  Object.entries(updates).forEach(([key, value]) => {
    if (!contextKeys.includes(key as (typeof contextKeys)[number])) return
    if (value === undefined || value === '') next.delete(key)
    else next.set(key, String(value))
  })
  return next
}

export function contextPath(pathname: string, context: NavigationContext) {
  const params = updateNavigationContext(new URLSearchParams(), context)
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
