import { useMemo } from 'react'
import { Filter } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { Anomaly, AnomalyTypeDefinition, DailyReport } from '../types'
import { readNavigationContext, updateNavigationContext } from '../services/navigationContext'
import { mergeStopMinutes, splitStopAnomaly } from '../services/anomalyDowntime'
import { computeReport, getReportTimeSummary } from '../services/kpiService'
import { getAnomalyTypeName } from '../services/referenceData'

type Shift = '白班' | '夜班'

interface RankItem {
  name: string
  minutes: number
}

interface Summary {
  key: string
  date: string
  shift: Shift
  line: string
  stopMinutes: number
  calendarMinutes: number
  theoreticalLoss: number
  stationRanks: RankItem[]
}

function reportFor(reports: DailyReport[], date: string, shift: Shift, line: string): DailyReport | undefined {
  return reports.find((report) => report.date === date && report.shift === shift && report.line === line)
    ?? reports.find((report) => report.date === date && report.line === line)
}

function rank(items: Map<string, number>) {
  return [...items.entries()]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
}

function buildAnalytics(anomalies: Anomaly[], reports: DailyReport[], filters: { startDate: string; endDate: string; line: string; shift: '' | Shift; station: string }, anomalyTypes: AnomalyTypeDefinition[]) {
  const grouped = new Map<string, ReturnType<typeof splitStopAnomaly>>()
  const typeMinutes = new Map<string, number>()

  anomalies.flatMap(splitStopAnomaly)
    .filter((segment) => !filters.startDate || segment.date >= filters.startDate)
    .filter((segment) => !filters.endDate || segment.date <= filters.endDate)
    .filter((segment) => !filters.line || segment.anomaly.line === filters.line)
    .filter((segment) => !filters.shift || segment.shift === filters.shift)
    .filter((segment) => !filters.station || segment.anomaly.stationName === filters.station)
    .forEach((segment) => {
      const key = `${segment.date}|${segment.shift}|${segment.anomaly.line}`
      const current = grouped.get(key) ?? []
      current.push(segment)
      grouped.set(key, current)
      const type = getAnomalyTypeName({ anomalyTypes }, segment.anomaly.type)
      const minutes = (segment.end - segment.start) / 60_000
      typeMinutes.set(type, (typeMinutes.get(type) ?? 0) + minutes)
    })

  const summaries: Summary[] = [...grouped.entries()].map(([key, segments]) => {
    const [date, shift, line] = key.split('|') as [string, Shift, string]
    const report = reportFor(reports, date, shift, line)
    const calendarMinutes = Math.max(1, (report ? getReportTimeSummary(report).calendarOpenHours : 12) * 60)
    const ctSeconds = Math.max(1, (report ? computeReport(report).lineCt : 30 / 3600) * 3600)
    const stationSegments = new Map<string, typeof segments>()
    segments.forEach((segment) => {
      const name = segment.anomaly.stationName || '未填写'
      stationSegments.set(name, [...(stationSegments.get(name) ?? []), segment])
    })
    const stationRanks = rank(new Map([...stationSegments].map(([name, stationItems]) => [name, mergeStopMinutes(stationItems)])))
    const stopMinutes = mergeStopMinutes(segments)
    return {
      key,
      date,
      shift,
      line,
      stopMinutes,
      calendarMinutes,
      theoreticalLoss: Math.round(stopMinutes * 60 / ctSeconds),
      stationRanks
    }
  }).sort((a, b) => b.date.localeCompare(a.date) || a.shift.localeCompare(b.shift) || a.line.localeCompare(b.line))

  const stationMinutes = new Map<string, number>()
  summaries.forEach((summary) => summary.stationRanks.forEach((station) => {
    const displayName = filters.line ? station.name : `${station.name}（${summary.line}）`
    stationMinutes.set(displayName, (stationMinutes.get(displayName) ?? 0) + station.minutes)
  }))

  return {
    summaries,
    typeRanks: rank(typeMinutes),
    stationRanks: rank(stationMinutes),
    totalStopMinutes: summaries.reduce((sum, summary) => sum + summary.stopMinutes, 0),
    totalCalendarMinutes: summaries.reduce((sum, summary) => sum + summary.calendarMinutes, 0),
    totalTheoreticalLoss: summaries.reduce((sum, summary) => sum + summary.theoreticalLoss, 0)
  }
}

const minutes = (value: number) => `${Math.round(value)} min`
const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const addDays = (value: string, days: number) => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function AnomalyAnalytics({ anomalies, reports, lines, stations, anomalyTypes }: { anomalies: Anomaly[]; reports: DailyReport[]; lines: string[]; stations: string[]; anomalyTypes: AnomalyTypeDefinition[] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const latestAnomalyDate = useMemo(
    () => anomalies.map((anomaly) => anomaly.startTime.slice(0, 10)).sort().at(-1) ?? '',
    [anomalies]
  )
  const stationOptions = useMemo(
    () => (stations.length ? stations : Array.from(new Set(anomalies.map((anomaly) => anomaly.stationName).filter(Boolean) as string[])).sort()),
    [anomalies, stations]
  )
  const { context, invalid } = useMemo(
    () => readNavigationContext(searchParams, { lines, stations: stationOptions }),
    [lines, searchParams, stationOptions]
  )
  const filters = {
    startDate: context.date ?? context.startDate ?? (latestAnomalyDate ? addDays(latestAnomalyDate, -6) : ''),
    endDate: context.date ?? context.endDate ?? latestAnomalyDate,
    line: context.line ?? '',
    shift: (context.shift ?? '') as '' | Shift,
    station: context.station ?? ''
  }
  const updateFilters = (updates: Partial<typeof filters>) => {
    setSearchParams(updateNavigationContext(searchParams, { ...filters, ...updates, date: undefined, anomalyId: undefined }), { replace: true })
  }
   const analytics = useMemo(() => buildAnalytics(anomalies, reports, filters, anomalyTypes), [anomalies, anomalyTypes, reports, filters])
  const largestStation = analytics.stationRanks[0]
  const stopRatio = analytics.totalCalendarMinutes ? analytics.totalStopMinutes / analytics.totalCalendarMinutes : 0
  const maxType = analytics.typeRanks[0]?.minutes ?? 1
  const maxStation = analytics.stationRanks[0]?.minutes ?? 1
  const rankScope = `${filters.shift || '全部班次'} / ${filters.line || '全部产线'}${filters.station ? ` / ${filters.station}` : ''}`
  const stationGridColumns = filters.line ? 'grid-cols-[48px_minmax(0,1fr)_82px]' : 'grid-cols-[116px_minmax(0,1fr)_82px]'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Filter size={16} />筛选</div>
        <div className="flex items-center gap-2">
          <input type="date" value={filters.startDate} onChange={(event) => updateFilters({ startDate: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <span className="text-slate-400">—</span>
          <input type="date" value={filters.endDate} onChange={(event) => updateFilters({ endDate: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={filters.line} onChange={(event) => updateFilters({ line: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部产线</option>{lines.map((line) => <option key={line} value={line}>{line}</option>)}</select>
        <select value={filters.shift} onChange={(event) => updateFilters({ shift: event.target.value as '' | Shift })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部班次</option><option value="白班">白班</option><option value="夜班">夜班</option></select>
        <select value={filters.station} onChange={(event) => updateFilters({ station: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部工位</option>{stationOptions.map((station) => <option key={station} value={station}>{station}</option>)}</select>
      </div>
      {invalid.length > 0 && <p role="status" className="text-xs text-[#9b7000]">部分链接条件无效，已采用默认筛选：{invalid.join('、')}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['总停线时间', minutes(analytics.totalStopMinutes)],
          ['停线占开线时长', percent(stopRatio)],
          ['理论产能损失', `${analytics.totalTheoreticalLoss} 件`],
          ['最大影响工位', largestStation ? `${largestStation.name} · ${minutes(largestStation.minutes)}` : '—']
        ].map(([label, value], index) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${index === 3 ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-slate-800">异常类型累计停线</h3><span className="text-xs text-slate-500">原始登记时长累计</span></div>
          <div className="space-y-3">{analytics.typeRanks.map((item) => <div key={item.name} className="grid grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 text-sm"><span className="text-slate-700">{item.name}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-slate-700" style={{ width: `${item.minutes / maxType * 100}%` }} /></div><span className="whitespace-nowrap text-right font-semibold text-slate-600">{minutes(item.minutes)}</span></div>)}</div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-bold text-slate-800">工位停线排行（{rankScope}）</h3><span className="text-xs text-slate-500">按当前筛选范围累计</span></div>
          {analytics.stationRanks.length > 0 ? <div className="space-y-3">{analytics.stationRanks.map((item, index) => <div key={item.name} className={`grid ${stationGridColumns} items-center gap-3 text-sm`}><span className={index === 0 ? 'font-semibold text-red-600' : 'text-slate-700'}>{item.name}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${index === 0 ? 'bg-[#950000]' : 'bg-slate-700'}`} style={{ width: `${item.minutes / maxStation * 100}%` }} /></div><span className="whitespace-nowrap text-right font-semibold text-slate-600">{minutes(item.minutes)}</span></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">暂无停线工位数据</p>}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-800">班次 / 产线停线汇总</h3><p className="mt-1 text-xs text-slate-500">工位排行按当前筛选范围汇总</p></div><span className="text-xs text-slate-500">OEE 影响 = 停线占日历开线时长</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm"><thead className="border-y border-slate-200 text-center text-xs text-slate-500"><tr><th className="px-3 py-3 font-medium">日期</th><th className="px-3 py-3 font-medium">班次</th><th className="px-3 py-3 font-medium">产线</th><th className="px-3 py-3 font-medium">停线时长</th><th className="px-3 py-3 font-medium">停线占比</th><th className="px-3 py-3 font-medium">理论产能损失</th><th className="px-3 py-3 font-medium">OEE 影响</th></tr></thead><tbody>{analytics.summaries.map((summary) => <tr key={summary.key} className="border-b border-slate-100 text-center transition-colors hover:bg-primary-50"><td className="px-3 py-3 font-medium text-slate-700">{summary.date}</td><td className="px-3 py-3 text-slate-600">{summary.shift}</td><td className="px-3 py-3 text-slate-600">{summary.line}</td><td className="px-3 py-3 text-slate-700">{minutes(summary.stopMinutes)}</td><td className="px-3 py-3 text-slate-700">{percent(summary.stopMinutes / summary.calendarMinutes)}</td><td className="px-3 py-3 text-slate-700">{summary.theoreticalLoss} 件</td><td className="px-3 py-3 text-red-600">-{percent(summary.stopMinutes / summary.calendarMinutes)}</td></tr>)}</tbody></table>
          {analytics.summaries.length === 0 && <p className="py-10 text-center text-sm text-slate-500">当前筛选条件下暂无停线数据</p>}
        </div>
      </section>
    </div>
  )
}
