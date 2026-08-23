import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Filter } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import TrendChart from '../components/TrendChart'
import BarChart from '../components/BarChart'
import ScatterChart from '../components/ScatterChart'
import { aggregateByDate, aggregateByLine, aggregateByShift, computeAllReports, filterReports, formatNumber, formatPercent, getReportTimeSummary, summarizeReports } from '../services/kpiService'
import { downtimeKey, getAnomalyDowntimeHoursByShift } from '../services/anomalyDowntime'
import { useAppData } from '../store/appStore'
import type { ComputedReport } from '../types'
import { readNavigationContext, updateNavigationContext } from '../services/navigationContext'

type ComparisonDimension = 'line' | 'shift'

type LaborEntry = {
  label: string
  line: string
  shift: string
  actualLaborHours: number
  theoreticalLaborHours: number
  standardEarnedLaborHours: number
  laborEfficiency: number
}

const toDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const toDateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const addDays = (value: string, days: number) => {
  const date = toDate(value)
  date.setDate(date.getDate() + days)
  return toDateString(date)
}

const daysBetween = (startDate: string, endDate: string) => Math.max(1, Math.round((toDate(endDate).getTime() - toDate(startDate).getTime()) / 86400000) + 1)

const deltaText = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`

function PeriodMetric({ title, value, delta, previousExists, onClick }: { title: string; value: string; delta: number; previousExists: boolean; onClick?: () => void }) {
  const deltaColor = delta < 0 ? 'text-[#950000]' : delta > 0 ? 'text-[#e1a300]' : 'text-[#787777]'
  return (
    <button type="button" onClick={onClick} title="查看对应生产日报" className="border-l border-[#d5d5d5] px-5 text-left first:border-l-0 first:pl-0 hover:bg-[#fff8df] focus:outline-none focus:ring-2 focus:ring-[#e1a300]">
      <p className="text-sm text-[#787777]">{title}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-[#1e1e1e]">{value}</p>
      <p className="mt-2 text-xs text-[#1e1e1e]">较上一周期 {previousExists ? <span className={deltaColor}>{deltaText(delta)}</span> : '—'}</p>
    </button>
  )
}

export default function EfficiencyAnalysis() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { productionReports, anomalies, settings } = useAppData()
  const computedReports = useMemo(() => computeAllReports(productionReports, anomalies), [anomalies, productionReports])
  const availableDates = useMemo(() => Array.from(new Set(computedReports.map((report) => report.date))).sort(), [computedReports])
  const latestDate = availableDates.at(-1) ?? '2026-07-26'
  const { context, invalid } = useMemo(
    () => readNavigationContext(searchParams, { lines: settings?.lines }),
    [searchParams, settings?.lines]
  )
  const filters = {
    startDate: context.date ?? context.startDate ?? addDays(latestDate, -29),
    endDate: context.date ?? context.endDate ?? latestDate,
    line: context.line ?? '',
    shift: context.shift ?? ''
  }
  const [comparisonDimension, setComparisonDimension] = useState<ComparisonDimension>('line')

  const updateFilters = (updates: Partial<typeof filters>) => {
    setSearchParams(updateNavigationContext(searchParams, { ...filters, ...updates, date: undefined }), { replace: true })
  }

  useEffect(() => {
    const targetId = context.metric === 'labor-gap' ? 'efficiency-labor' : context.metric ? `efficiency-${context.metric}` : ''
    if (context.source === 'dashboard' && targetId) requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ block: 'center' }))
  }, [context.metric, context.source])

  useEffect(() => {
    const savedScroll = sessionStorage.getItem('efficiency-scroll-y')
    if (savedScroll) {
      sessionStorage.removeItem('efficiency-scroll-y')
      requestAnimationFrame(() => window.scrollTo({ top: Number(savedScroll), behavior: 'instant' as ScrollBehavior }))
    }
  }, [])

  const filtered = useMemo(() => filterReports(computedReports, filters), [computedReports, filters])
  const byDate = useMemo(() => aggregateByDate(filtered), [filtered])
  const anomalyDowntimeByShift = useMemo(() => getAnomalyDowntimeHoursByShift(anomalies), [anomalies])
  const anomalyDowntimeByDate = useMemo(() => {
    const totals = new Map<string, number>()
    filtered.forEach((report) => {
      const minutes = (anomalyDowntimeByShift.get(downtimeKey(report.date, report.line, report.shift)) ?? 0) * 60
      totals.set(report.date, (totals.get(report.date) ?? 0) + minutes)
    })
    return byDate.map((report) => Number((totals.get(report.date) ?? 0).toFixed(1)))
  }, [anomalyDowntimeByShift, byDate, filtered])
  const byLine = useMemo(() => aggregateByLine(filtered), [filtered])
  const byShift = useMemo(() => aggregateByShift(filtered), [filtered])
  const currentSummary = useMemo(() => summarizeReports(filtered), [filtered])

  const previousFilters = useMemo(() => {
    const duration = daysBetween(filters.startDate, filters.endDate)
    return {
      ...filters,
      startDate: addDays(filters.startDate, -duration),
      endDate: addDays(filters.startDate, -1)
    }
  }, [filters])
  const previousReports = useMemo(() => filterReports(computedReports, previousFilters), [computedReports, previousFilters])
  const previousSummary = useMemo(() => summarizeReports(previousReports), [previousReports])
  const hasPrevious = previousReports.length > 0

  const bestDay = useMemo(() => byDate.reduce((best, report) => !best || report.oee > best.oee ? report : best, byDate[0]), [byDate])
  const worstDay = useMemo(() => byDate.reduce((worst, report) => !worst || report.oee < worst.oee ? report : worst, byDate[0]), [byDate])
  const oeeRange = useMemo(() => byDate.length ? Math.max(...byDate.map((report) => report.oee)) - Math.min(...byDate.map((report) => report.oee)) : 0, [byDate])
  const declineDays = useMemo(() => {
    let count = 1
    for (let index = byDate.length - 1; index > 0; index -= 1) {
      if (byDate[index].oee < byDate[index - 1].oee) count += 1
      else break
    }
    return count > 1 ? count : 0
  }, [byDate])

  const comparisonData = comparisonDimension === 'line' ? byLine : byShift
  const laborEntries = useMemo(() => {
    const grouped = new Map<string, Omit<LaborEntry, 'label' | 'line' | 'shift'>>()
    filtered.forEach((report) => {
      const { actualLaborHours, theoreticalLaborHours } = getReportTimeSummary(report)
      const label = `${report.line} · ${report.shift ?? '—'}`
      const current = grouped.get(label) ?? { actualLaborHours: 0, theoreticalLaborHours: 0, standardEarnedLaborHours: 0, laborEfficiency: 0 }
      grouped.set(label, {
        actualLaborHours: current.actualLaborHours + actualLaborHours,
        theoreticalLaborHours: current.theoreticalLaborHours + theoreticalLaborHours,
        standardEarnedLaborHours: current.standardEarnedLaborHours + report.standardEarnedLaborHours,
        laborEfficiency: 0
      })
    })
    return Array.from(grouped, ([label, values]) => {
      const [line, shift] = label.split(' · ')
      return { label, line, shift, ...values, laborEfficiency: values.actualLaborHours > 0 ? values.standardEarnedLaborHours / values.actualLaborHours : 0 }
    }).sort((a, b) => a.laborEfficiency - b.laborEfficiency)
  }, [filtered])
  const downtimePoints = useMemo(() => filtered.map((report) => {
    const { calendarOpenHours: calendarHours } = getReportTimeSummary(report)
    return { x: calendarHours > 0 ? report.totalDowntimeHours / calendarHours * 100 : 0, y: report.oee * 100, label: `${report.date} · ${report.line} · ${report.shift ?? '—'}` }
  }), [filtered])
  const detailRows = useMemo(() => [...filtered].sort((a, b) => b.date.localeCompare(a.date) || a.line.localeCompare(b.line)).slice(0, 10), [filtered])

  const setQuickRange = (days: number) => updateFilters({ startDate: addDays(latestDate, -(days - 1)), endDate: latestDate })
  const openDailyReports = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const values = { startDate: filters.startDate, endDate: filters.endDate, line: filters.line || undefined, shift: filters.shift || undefined, source: 'efficiency', ...updates }
    Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value) })
    params.set('returnTo', `${location.pathname}${location.search}`)
    sessionStorage.setItem('efficiency-scroll-y', String(window.scrollY))
    navigate(`/daily-report?${params.toString()}`)
  }
  const openDailyReport = (report: ComputedReport) => openDailyReports({ date: report.date, line: report.line, shift: report.shift, reportId: report.id })
  const openAnomalyAnalysis = (date?: string) => {
    const params = new URLSearchParams()
    const values = {
      date,
      startDate: date ?? filters.startDate,
      endDate: date ?? filters.endDate,
      line: filters.line || undefined,
      shift: filters.shift || undefined,
      metric: 'downtime',
      source: 'efficiency'
    }
    Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value) })
    navigate(`/anomalies?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#1e1e1e]">效率分析</h2>
        <p className="mt-0.5 text-sm text-[#787777]">按时间、产线和班次对生产效率进行历史诊断与对比</p>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d5d5d5] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[#787777]"><Filter size={16} /><span className="text-sm font-medium">筛选</span></div>
        <input type="date" value={filters.startDate} onChange={(event) => updateFilters({ startDate: event.target.value })} className="rounded-lg border border-[#d5d5d5] px-3 py-1.5 text-sm outline-none focus:border-[#e1a300]" />
        <span className="text-[#787777]">—</span>
        <input type="date" value={filters.endDate} onChange={(event) => updateFilters({ endDate: event.target.value })} className="rounded-lg border border-[#d5d5d5] px-3 py-1.5 text-sm outline-none focus:border-[#e1a300]" />
        <div className="flex overflow-hidden rounded-lg border border-[#d5d5d5] text-sm">
          {[['近7天', 7], ['近30天', 30]].map(([label, days]) => <button key={label} type="button" onClick={() => setQuickRange(days as number)} className="border-r border-[#d5d5d5] px-3 py-1.5 last:border-r-0 hover:bg-[#fff8df]">{label}</button>)}
          <button type="button" className="px-3 py-1.5 text-[#787777]" aria-label="自定义时间范围">自定义</button>
        </div>
        <select value={filters.line} onChange={(event) => updateFilters({ line: event.target.value })} className="rounded-lg border border-[#d5d5d5] px-3 py-1.5 text-sm outline-none focus:border-[#e1a300]"><option value="">全部产线</option>{(settings?.lines ?? []).map((line) => <option key={line} value={line}>{line}</option>)}</select>
        <select value={filters.shift} onChange={(event) => updateFilters({ shift: event.target.value as typeof filters.shift })} className="rounded-lg border border-[#d5d5d5] px-3 py-1.5 text-sm outline-none focus:border-[#e1a300]"><option value="">全部班次</option><option value="白班">白班</option><option value="夜班">夜班</option></select>
      </section>
      {invalid.length > 0 && <p role="status" className="text-xs text-[#9b7000]">部分链接条件无效，已采用默认筛选：{invalid.join('、')}</p>}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
        <div className="rounded-xl border border-[#d5d5d5] bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-end justify-between gap-4"><div><h3 className="font-bold text-[#1e1e1e]">当前周期 vs 上一周期</h3><p className="mt-1 text-xs text-[#787777]">上一周期按相同天数与筛选条件计算</p></div><span className="text-xs text-[#787777]">{filters.startDate} 至 {filters.endDate}</span></div>
          <div className="grid grid-cols-2 gap-y-6 md:grid-cols-4">
            <PeriodMetric title="计划达成率" value={formatPercent(currentSummary.achievementRate)} delta={currentSummary.achievementRate - previousSummary.achievementRate} previousExists={hasPrevious} onClick={() => openDailyReports({ metric: 'achievement' })} />
            <PeriodMetric title="OEE" value={formatPercent(currentSummary.oee)} delta={currentSummary.oee - previousSummary.oee} previousExists={hasPrevious} onClick={() => openDailyReports({ metric: 'oee' })} />
            <PeriodMetric title="UPPH" value={formatNumber(currentSummary.upph, 1)} delta={previousSummary.upph > 0 ? currentSummary.upph / previousSummary.upph - 1 : 0} previousExists={hasPrevious} onClick={() => openDailyReports({ metric: 'upph' })} />
            <PeriodMetric title="良率" value={formatPercent(currentSummary.yieldRate)} delta={currentSummary.yieldRate - previousSummary.yieldRate} previousExists={hasPrevious} onClick={() => openDailyReports({ metric: 'yield' })} />
          </div>
        </div>
        <div className="flex min-h-[236px] flex-col rounded-xl border border-[#d5d5d5] bg-white p-5 shadow-sm"><h3 className="font-bold text-[#1e1e1e]">效率诊断摘要</h3><div className="mt-4 grid flex-1 grid-rows-4 text-sm"><button type="button" title="查看对应生产日报" onClick={() => bestDay && openDailyReports({ date: bestDay.date, metric: 'oee' })} className="flex h-full w-full items-center justify-between border-b border-[#d5d5d5] text-left hover:text-[#950000] focus:outline-none focus:ring-2 focus:ring-[#e1a300]"><span className="text-[#787777]">最佳日期（最高 OEE）</span><span className="font-semibold text-[#1e1e1e]">{bestDay ? `${bestDay.date} · ${formatPercent(bestDay.oee)}` : '—'}</span></button><button type="button" title="查看对应生产日报" onClick={() => worstDay && openDailyReports({ date: worstDay.date, metric: 'oee' })} className="flex h-full w-full items-center justify-between border-b border-[#d5d5d5] text-left hover:text-[#950000] focus:outline-none focus:ring-2 focus:ring-[#e1a300]"><span className="text-[#787777]">最低日期（最低 OEE）</span><span className="font-semibold text-[#1e1e1e]">{worstDay ? `${worstDay.date} · ${formatPercent(worstDay.oee)}` : '—'}</span></button><div className="flex h-full items-center justify-between border-b border-[#d5d5d5]"><span className="text-[#787777]">OEE 波动幅度</span><span className="font-semibold text-[#1e1e1e]">{formatPercent(oeeRange)}</span></div><button type="button" title="查看对应生产日报" onClick={() => declineDays >= 2 && byDate.at(-1) && openDailyReports({ date: byDate.at(-1)?.date, metric: 'oee' })} className="flex h-full w-full items-center justify-between text-left hover:text-[#950000] focus:outline-none focus:ring-2 focus:ring-[#e1a300]"><span className="text-[#787777]">连续下降</span><span className={declineDays >= 3 ? 'font-semibold text-[#950000]' : 'font-semibold text-[#1e1e1e]'}>{declineDays >= 2 ? `${declineDays} 天` : '未发现'}</span></button></div></div>
      </section>

      <section>
        <div className="mb-3"><h3 className="font-bold text-[#1e1e1e]">核心效率趋势</h3><p className="mt-1 text-xs text-[#787777]">可按筛选范围观察 CT、计划、质量与效率的连续变化</p></div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <TrendChart title="CT 变化" xAxis={byDate.map((report) => report.date.slice(5))} yAxisName="CT(秒)" formatter="{value}s" series={[{ name: 'CT', data: byDate.map((report) => Number((report.ct * 3600).toFixed(1))), color: '#787777' }]} onRangeClick={() => openDailyReports({ metric: 'ct' })} onPointClick={(index) => byDate[index] && openDailyReports({ date: byDate[index].date, metric: 'ct' })} />
          <TrendChart title="计划达成率变化" xAxis={byDate.map((report) => report.date.slice(5))} yAxisName="计划达成率(%)" formatter="{value}%" series={[{ name: '计划达成率', data: byDate.map((report) => Number((report.achievementRate * 100).toFixed(1))), color: '#e1a300' }]} onRangeClick={() => openDailyReports({ metric: 'achievement' })} onPointClick={(index) => byDate[index] && openDailyReports({ date: byDate[index].date, metric: 'achievement' })} />
          <div id="efficiency-oee" className="scroll-mt-20"><TrendChart title="OEE 趋势" xAxis={byDate.map((report) => report.date.slice(5))} yAxisName="OEE(%)" formatter="{value}%" series={[{ name: 'OEE', data: byDate.map((report) => Number((report.oee * 100).toFixed(1))), color: '#1e1e1e' }]} onRangeClick={() => openDailyReports({ metric: 'oee' })} onPointClick={(index) => byDate[index] && openDailyReports({ date: byDate[index].date, metric: 'oee' })} /></div>
          <div id="efficiency-upph" className="scroll-mt-20"><TrendChart title="UPPH 趋势" xAxis={byDate.map((report) => report.date.slice(5))} yAxisName="UPPH(件/人·时)" series={[{ name: 'UPPH', data: byDate.map((report) => Number(report.upph.toFixed(1))), color: '#950000' }]} onRangeClick={() => openDailyReports({ metric: 'upph' })} onPointClick={(index) => byDate[index] && openDailyReports({ date: byDate[index].date, metric: 'upph' })} /></div>
          <TrendChart title="良率趋势" xAxis={byDate.map((report) => report.date.slice(5))} yAxisName="良率(%)" formatter="{value}%" series={[{ name: '良率', data: byDate.map((report) => Number((report.yieldRate * 100).toFixed(1))), color: '#787777' }]} onRangeClick={() => openDailyReports({ metric: 'yield' })} onPointClick={(index) => byDate[index] && openDailyReports({ date: byDate[index].date, metric: 'yield' })} />
          <TrendChart title="异常停线时间变化" xAxis={byDate.map((report) => report.date.slice(5))} yAxisName="异常停线时间(分钟)" formatter="{value} min" series={[{ name: '异常停线时间', data: anomalyDowntimeByDate, color: '#950000' }]} onRangeClick={() => openAnomalyAnalysis()} onPointClick={(index) => byDate[index] && openAnomalyAnalysis(byDate[index].date)} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-[#1e1e1e]">效率对比</h3><p className="mt-1 text-xs text-[#787777]">从产线或班次识别相对差异</p></div><div className="flex rounded-lg border border-[#d5d5d5] p-0.5 text-sm">{([['line', '产线'], ['shift', '班次']] as const).map(([dimension, label]) => <button key={dimension} type="button" onClick={() => setComparisonDimension(dimension)} aria-pressed={comparisonDimension === dimension} className={`rounded-md px-3 py-1.5 ${comparisonDimension === dimension ? 'bg-[#1e1e1e] text-white' : 'text-[#787777] hover:bg-[#fff8df]'}`}>{label}</button>)}</div></div>
        <BarChart title={`${comparisonDimension === 'line' ? '各产线' : '各班次'}效率对比`} xAxis={comparisonData.map((report) => report.line)} dualAxis series={[{ name: 'OEE(%)', data: comparisonData.map((report) => Number((report.oee * 100).toFixed(1))), color: '#1e1e1e' }, { name: '计划达成率(%)', data: comparisonData.map((report) => Number((report.achievementRate * 100).toFixed(1))), color: '#e1a300' }, { name: 'UPPH', data: comparisonData.map((report) => Number(report.upph.toFixed(1))), color: '#950000', yAxisIndex: 1 }]} onBarClick={(index, seriesIndex) => { const item = comparisonData[index]; if (!item) return; openDailyReports({ ...(comparisonDimension === 'line' ? { line: item.line } : { shift: item.line }), metric: (['oee', 'achievement', 'upph'] as const)[seriesIndex] ?? 'oee' }) }} />
        <div id="efficiency-labor" className="grid scroll-mt-20 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
          <BarChart title="人力投入与产出" xAxis={laborEntries.map((entry) => entry.label)} series={[{ name: '实际出勤工时', data: laborEntries.map((entry) => Number(entry.actualLaborHours.toFixed(1))), color: '#1e1e1e' }, { name: '理论出勤工时', data: laborEntries.map((entry) => Number(entry.theoreticalLaborHours.toFixed(1))), color: '#e1a300' }, { name: '标准挣得工时', data: laborEntries.map((entry) => Number(entry.standardEarnedLaborHours.toFixed(1))), color: '#950000' }]} onBarClick={(index) => { const entry = laborEntries[index]; if (entry) openDailyReports({ line: entry.line, shift: entry.shift, metric: 'labor-gap' }) }} />
          <div className="rounded-xl border border-[#d5d5d5] bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between gap-3 border-b border-[#d5d5d5] pb-4"><h3 className="font-bold text-[#1e1e1e]">人力效率</h3><span className="text-xs text-[#787777]">标准挣得 ÷ 实际工时</span></div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_72px_64px] gap-3 px-1 py-2 text-xs text-[#787777]"><span>对象</span><span className="text-right">标准挣得</span><span className="text-right">人力效率</span></div>
            <div className="divide-y divide-[#e5e3dc]">{laborEntries.map((entry, index) => <button key={entry.label} type="button" title="查看对应生产日报" onClick={() => openDailyReports({ line: entry.line, shift: entry.shift, metric: 'labor-gap' })} className="grid w-full grid-cols-[minmax(0,1fr)_72px_64px] items-center gap-3 py-3 text-left hover:bg-[#fff8df] focus:outline-none focus:ring-2 focus:ring-[#e1a300]"><span className="truncate text-sm font-medium text-[#1e1e1e]">{entry.label}</span><span className="text-right text-sm text-[#787777]">{formatNumber(entry.standardEarnedLaborHours, 1)}h</span><span className={`text-right text-sm font-semibold ${index === 0 && entry.laborEfficiency < 0.85 ? 'text-[#950000]' : 'text-[#1e1e1e]'}`}>{formatPercent(entry.laborEfficiency)}</span></button>)}</div>
            {!laborEntries.length && <p className="py-8 text-center text-sm text-[#787777]">暂无人力工时数据</p>}
          </div>
        </div>
        <div className="scroll-mt-20" id="efficiency-downtime-oee"><ScatterChart title="停线占比与 OEE" xAxisName="停线占比(%)" yAxisName="OEE(%)" color="#e1a300" points={downtimePoints} onPointClick={(index) => { const report = filtered[index]; if (report) openDailyReports({ date: report.date, line: report.line, shift: report.shift, reportId: report.id, metric: 'downturn' }) }} /></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d5d5d5] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#d5d5d5] p-5"><div><h3 className="font-bold text-[#1e1e1e]">日报下钻</h3><p className="mt-1 text-xs text-[#787777]">点击记录进入生产日报查看同日、同产线、同班次的数据</p></div><span className="text-xs text-[#787777]">显示最近 10 条</span></div>
        <div className="overflow-x-auto"><table className="min-w-[900px] w-full table-fixed text-sm"><colgroup><col className="w-[12%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[16%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[18%]" /></colgroup><thead className="bg-[#f5f4f0] text-[#787777]"><tr><th className="px-4 py-3 text-center font-medium">日期</th><th className="px-4 py-3 text-center font-medium">班次</th><th className="px-4 py-3 text-center font-medium">产线</th><th className="px-4 py-3 text-center font-medium">型号</th><th className="px-4 py-3 text-center font-medium">OEE</th><th className="px-4 py-3 text-center font-medium">UPPH</th><th className="px-4 py-3 text-center font-medium">良率</th><th className="px-4 py-3 text-center font-medium">操作</th></tr></thead><tbody className="divide-y divide-[#d5d5d5]">{detailRows.map((report) => <tr key={report.id} role="button" tabIndex={0} title="查看对应生产日报" onClick={() => openDailyReport(report)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDailyReport(report) } }} className="cursor-pointer hover:bg-[#fff8df] focus:bg-[#fff8df] focus:outline-none"><td className="px-4 py-3 text-center text-[#1e1e1e]">{report.date}</td><td className="px-4 py-3 text-center">{report.shift ?? '—'}</td><td className="px-4 py-3 text-center font-medium">{report.line}</td><td className="truncate px-4 py-3 text-center text-[#787777]">{report.productModel}</td><td className="px-4 py-3 text-center">{formatPercent(report.oee)}</td><td className="px-4 py-3 text-center">{formatNumber(report.upph, 1)}</td><td className="px-4 py-3 text-center">{formatPercent(report.yieldRate)}</td><td className="px-4 py-3 text-center"><button type="button" onClick={(event) => { event.stopPropagation(); openDailyReport(report) }} className="inline-flex items-center gap-1 text-xs font-medium text-[#1e1e1e] hover:text-[#950000]">查看日报 <ArrowRight size={14} /></button></td></tr>)}</tbody></table></div>
        {detailRows.length === 0 && <div className="p-8 text-center text-sm text-[#787777]">暂无符合条件的数据</div>}
      </section>
    </div>
  )
}
