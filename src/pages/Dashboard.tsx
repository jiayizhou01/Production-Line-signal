import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { computeAllReports, summarizeReports } from '../services/kpiService'
import { useAppData } from '../store/appStore'
import type { ComputedReport, KpiAggregate } from '../types'
import { contextPath, type NavigationMetric } from '../services/navigationContext'
import { getAnomalyTypeName } from '../services/referenceData'

type LineStatus = 'normal' | 'attention' | 'abnormal'

const statusLabels: Record<LineStatus, string> = {
  normal: '正常',
  attention: '关注',
  abnormal: '异常'
}

const statusOrder: Record<LineStatus, number> = {
  abnormal: 0,
  attention: 1,
  normal: 2
}

function getLineStatus(summary: KpiAggregate): LineStatus {
  if (summary.achievementRate < 0.9 || summary.oee < 0.8 || summary.downtimeRatio >= 0.1) {
    return 'abnormal'
  }
  if (summary.achievementRate < 1 || summary.oee < 0.85 || summary.downtimeRatio >= 0.05) {
    return 'attention'
  }
  return 'normal'
}

function getMetricLevel(metric: 'achievement' | 'oee' | 'downtime', value: number) {
  if (
    (metric === 'achievement' && value < 0.9) ||
    (metric === 'oee' && value < 0.8) ||
    (metric === 'downtime' && value >= 0.1)
  ) {
    return 'abnormal'
  }
  if (
    (metric === 'achievement' && value < 1) ||
    (metric === 'oee' && value < 0.85) ||
    (metric === 'downtime' && value >= 0.05)
  ) {
    return 'attention'
  }
  return 'normal'
}

function metricValueClass(level: string) {
  return level === 'abnormal' ? 'font-semibold text-[#950000]' : level === 'attention' ? 'font-semibold text-[#e1a300]' : 'text-[#1e1e1e]'
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatDelta(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}%`
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value)
}

function MetricCard({
  title,
  value,
  detail,
  comparison,
  alert = false,
  accentColor,
  onClick
}: {
  title: string
  value: string
  detail: string
  comparison?: string
  alert?: boolean
  accentColor: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-w-0 border-l border-[#e5e3dc] bg-white p-5 text-left transition-colors first:border-l-0 hover:bg-[#fffdf2] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300] focus-visible:ring-inset"
    >
      <span className="absolute inset-x-5 top-0 h-[3px]" style={{ backgroundColor: accentColor }} aria-hidden="true" />
      <div className="text-sm font-medium text-[#787777]">{title}</div>
      <div className={`mt-2 text-3xl font-bold tracking-[-0.03em] ${alert ? 'text-[#950000]' : 'text-[#1e1e1e]'}`}>
        {value}
      </div>
      <div className="mt-3 space-y-1 text-xs text-[#787777]">
        <div className="min-h-4 whitespace-pre-line leading-5">{detail || '\u00a0'}</div>
        <div className="min-h-4 whitespace-nowrap text-[#1e1e1e]">
          {comparison ? (
            <>
              <span>较昨日 </span>
              <span className={comparison.startsWith('-') ? 'text-[#950000]' : 'text-[#e1a300]'}>
                {comparison}
              </span>
            </>
          ) : '\u00a0'}
        </div>
      </div>
    </button>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { productionReports, anomalies, settings } = useAppData()
  const [rulesOpen, setRulesOpen] = useState(false)
  useEffect(() => {
    const savedPosition = sessionStorage.getItem('dashboard-scroll-position')
    if (savedPosition) requestAnimationFrame(() => window.scrollTo(0, Number(savedPosition)))
    const savePosition = () => sessionStorage.setItem('dashboard-scroll-position', String(window.scrollY))
    window.addEventListener('scroll', savePosition, { passive: true })
    return () => {
      savePosition()
      window.removeEventListener('scroll', savePosition)
    }
  }, [])
  const computedReports = useMemo(() => computeAllReports(productionReports, anomalies), [anomalies, productionReports])
  const dates = useMemo(
    () => Array.from(new Set(computedReports.map((report) => report.date))).sort(),
    [computedReports]
  )
  const latestDate = dates.at(-1) ?? ''
  const previousDate = dates.at(-2) ?? ''

  const latestReports = useMemo(
    () => computedReports.filter((report) => report.date === latestDate),
    [computedReports, latestDate]
  )
  const previousReports = useMemo(
    () => computedReports.filter((report) => report.date === previousDate),
    [computedReports, previousDate]
  )
  const latestSummary = useMemo(() => summarizeReports(latestReports), [latestReports])
  const previousSummary = useMemo(() => summarizeReports(previousReports), [previousReports])

  const lineRows = useMemo(() => {
    const groups = new Map<string, ComputedReport[]>()
    latestReports.forEach((report) => {
      groups.set(report.line, [...(groups.get(report.line) ?? []), report])
    })

    return Array.from(groups, ([line, reports]) => {
      const summary = summarizeReports(reports)
      const status = getLineStatus(summary)
      const theoreticalLoss = summary.weightedCt > 0 ? summary.downtimeHours / summary.weightedCt : 0
      return { line, summary, status, theoreticalLoss }
    }).sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.theoreticalLoss - a.theoreticalLoss)
  }, [latestReports])

  const anomalyInsights = useMemo(() => {
    const latestAnomalies = anomalies.filter(
      (anomaly) => anomaly.startTime.startsWith(latestDate) && anomaly.impactType !== 'nonstop'
    )
    const typeTotals = new Map<string, number>()
    const stationTotals = new Map<string, { station: string; line: string; minutes: number }>()

    latestAnomalies.forEach((anomaly) => {
      typeTotals.set(anomaly.type, (typeTotals.get(anomaly.type) ?? 0) + anomaly.impactMinutes)
      if (anomaly.stationName) {
        const key = `${anomaly.line}|${anomaly.stationName}`
        const current = stationTotals.get(key)
        stationTotals.set(key, {
          station: anomaly.stationName,
          line: anomaly.line,
          minutes: (current?.minutes ?? 0) + anomaly.impactMinutes
        })
      }
    })

    const largestType = Array.from(typeTotals.entries()).sort((a, b) => b[1] - a[1])[0]
    const largestStation = Array.from(stationTotals.values()).sort((a, b) => b.minutes - a.minutes)[0]
    return { largestType, largestStation }
  }, [anomalies, latestDate])

  const openAnomalies = useMemo(
    () =>
      [...anomalies]
        .filter((anomaly) => anomaly.status !== 'closed')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [anomalies]
  )

  const largestLossLine = [...lineRows].sort((a, b) => b.theoreticalLoss - a.theoreticalLoss)[0]
  const achievementDelta = latestSummary.achievementRate - previousSummary.achievementRate
  const oeeDelta = latestSummary.oee - previousSummary.oee
  const upphDelta = previousSummary.upph > 0 ? latestSummary.upph / previousSummary.upph - 1 : 0
  const yieldDelta = latestSummary.yieldRate - previousSummary.yieldRate
  const downtimeDelta = previousSummary.downtimeHours > 0
    ? latestSummary.downtimeHours / previousSummary.downtimeHours - 1
    : 0
  const laborGapDelta = previousSummary.theoreticalLaborHours > 0
    ? (latestSummary.laborGap - previousSummary.laborGap) / previousSummary.theoreticalLaborHours
    : 0
  const efficiencyTarget = (metric: NavigationMetric, line?: string) => contextPath('/efficiency', {
    date: latestDate,
    startDate: latestDate,
    endDate: latestDate,
    line,
    metric,
    source: 'dashboard'
  })
  const anomalyTarget = (updates: { line?: string; station?: string; anomalyId?: string } = {}) => contextPath('/anomalies', {
    date: latestDate,
    startDate: latestDate,
    endDate: latestDate,
    metric: 'downtime',
    source: 'dashboard',
    ...updates
  })

  return (
    <div className="space-y-5 pb-6">
      <header className="flex flex-col gap-3 border-b border-[#d5d5d5] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-[-0.02em] text-[#1e1e1e]">生产驾驶舱</h2>
          <p className="mt-1 text-sm text-[#787777]">汇总最近完整生产日的产出、效率、损失与遗留事项</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[#787777]">
          <span>数据日期 {latestDate}</span>
          <span>最后录入 {latestDate}</span>
        </div>
      </header>

      <section aria-label="最近完整生产日核心指标" className="grid overflow-hidden rounded-xl border border-[#d5d5d5] bg-white grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          title="计划达成率"
          value={formatPercent(latestSummary.achievementRate)}
          detail={`实际 ${formatNumber(latestSummary.actualQty)} / 计划 ${formatNumber(latestSummary.plannedQty)}`}
          comparison={previousDate ? formatDelta(achievementDelta) : undefined}
          accentColor="#1e1e1e"
          onClick={() => navigate(efficiencyTarget('achievement'))}
        />
        <MetricCard
          title="OEE"
          value={formatPercent(latestSummary.oee)}
          detail=""
          comparison={previousDate ? formatDelta(oeeDelta) : undefined}
          accentColor="#1e1e1e"
          onClick={() => navigate(efficiencyTarget('oee'))}
        />
        <MetricCard
          title="UPPH"
          value={formatNumber(latestSummary.upph, 1)}
          detail=""
          comparison={previousDate ? formatDelta(upphDelta) : undefined}
          accentColor="#1e1e1e"
          onClick={() => navigate(efficiencyTarget('upph'))}
        />
        <MetricCard
          title="良率"
          value={formatPercent(latestSummary.yieldRate)}
          detail={`不良品 ${formatNumber(latestSummary.defectQty)} 件`}
          comparison={previousDate ? formatDelta(yieldDelta) : undefined}
          accentColor="#1e1e1e"
          onClick={() => navigate(efficiencyTarget('yield'))}
        />
        <MetricCard
          title="总停线时间"
          value={`${formatNumber(latestSummary.downtimeHours * 60)} min`}
          detail={`占开线时长 ${formatPercent(latestSummary.downtimeRatio)}`}
          comparison={previousDate ? formatDelta(downtimeDelta) : undefined}
          alert={latestSummary.downtimeRatio >= 0.1}
          accentColor="#e1a300"
          onClick={() => navigate(anomalyTarget())}
        />
        <MetricCard
          title="人力工时差"
          value={`${latestSummary.laborGap > 0 ? '+' : ''}${formatNumber(latestSummary.laborGap, 1)}h`}
          detail={`标准挣得 ${formatNumber(latestSummary.standardEarnedLaborHours, 1)}h\n实际 ${formatNumber(latestSummary.actualLaborHours, 1)}h / 理论 ${formatNumber(latestSummary.theoreticalLaborHours, 1)}h`}
          comparison={previousDate ? formatDelta(laborGapDelta) : undefined}
          alert={latestSummary.laborGap < 0}
          accentColor="#950000"
          onClick={() => navigate(efficiencyTarget('labor-gap'))}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-[#d5d5d5] bg-white xl:col-span-2">
          <div className="border-b border-[#d5d5d5] px-5 py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-[#1e1e1e]">各产线昨日汇总</h3>
              <p className="mt-0.5 text-xs text-[#787777]">白班与夜班合并，按风险等级优先排列</p>
            </div>
            <button
              type="button"
              onClick={() => setRulesOpen((open) => !open)}
              aria-expanded={rulesOpen}
              className="flex items-center gap-1 text-xs text-[#787777] hover:text-[#1e1e1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]"
            >
              <Info size={14} aria-hidden="true" />
              <span>状态判定规则</span>
              <ChevronDown size={14} className={`transition-transform ${rulesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            </div>
            {rulesOpen ? (
              <div className="mt-4 rounded-lg border border-[#d5d5d5] bg-[#f9f8f3] p-3 text-xs text-[#1e1e1e]">
                <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border-b border-[#d5d5d5] pb-2 font-semibold">
                  <span>指标</span>
                  <span className="text-center">正常</span>
                  <span className="text-center text-[#e1a300]">关注</span>
                  <span className="text-center text-[#950000]">异常</span>
                </div>
                <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border-b border-[#e5e3dc] py-2">
                  <span>计划达成率</span><span className="text-center">≥100%</span><span className="text-center text-[#e1a300]">90%~99.9%</span><span className="text-center text-[#950000]">&lt;90%</span>
                </div>
                <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border-b border-[#e5e3dc] py-2">
                  <span>OEE</span><span className="text-center">≥85%</span><span className="text-center text-[#e1a300]">80%~84.9%</span><span className="text-center text-[#950000]">&lt;80%</span>
                </div>
                <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] py-2">
                  <span>停线占比</span><span className="text-center">&lt;5%</span><span className="text-center text-[#e1a300]">5%~9.9%</span><span className="text-center text-[#950000]">≥10%</span>
                </div>
                <div className="mt-2 border-t border-[#d5d5d5] pt-2 leading-5">
                  <span className="font-semibold">判断规则：</span>
                  <span className="ml-2">三项全部正常 → 正常；至少一项关注、没有异常 → 关注；任意一项异常 → 异常。</span>
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-[#f5f4ef] text-[#787777]">
                <tr>
                  <th className="w-[12%] px-2 py-3 text-center font-medium whitespace-nowrap">产线</th>
                  <th className="w-[10%] px-2 py-3 text-center font-medium whitespace-nowrap">状态</th>
                  <th className="w-[15%] px-2 py-3 text-center font-medium whitespace-nowrap">计划达成率</th>
                  <th className="w-[11%] px-2 py-3 text-center font-medium whitespace-nowrap">OEE</th>
                  <th className="w-[10%] px-2 py-3 text-center font-medium whitespace-nowrap">UPPH</th>
                  <th className="w-[11%] px-2 py-3 text-center font-medium whitespace-nowrap">良率</th>
                  <th className="w-[14%] px-2 py-3 text-center font-medium whitespace-nowrap">停线时间</th>
                  <th className="w-[17%] px-2 py-3 text-center font-medium whitespace-nowrap">人力工时差</th>
                </tr>
              </thead>
              <tbody>
                {lineRows.map(({ line, summary, status }) => (
                  <tr key={line} className="border-t border-[#e5e3dc] transition-colors hover:bg-[#fff9df]">
                    <td className="px-2 py-3 text-center font-semibold text-[#1e1e1e] whitespace-nowrap"><button type="button" onClick={() => navigate(efficiencyTarget('oee', line))} className="hover:text-[#950000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]">{line}</button></td>
                    <td className="px-2 py-3 text-center">
                      <span className={`inline-flex min-w-14 justify-center rounded-md border px-2 py-1 text-xs font-semibold ${
                        status === 'abnormal'
                          ? 'border-[#d99494] bg-[#fff1f1] text-[#950000]'
                          : status === 'attention'
                            ? 'border-[#e1a300] bg-[#fff9df] text-[#9b7000]'
                            : 'border-[#787777] bg-[#f5f4ef] text-[#1e1e1e]'
                      }`}>
                        {statusLabels[status]}
                      </span>
                    </td>
                    <td className={`px-2 py-3 text-center whitespace-nowrap ${metricValueClass(getMetricLevel('achievement', summary.achievementRate))}`}>
                      {formatPercent(summary.achievementRate)}
                    </td>
                    <td className={`px-2 py-3 text-center whitespace-nowrap ${metricValueClass(getMetricLevel('oee', summary.oee))}`}>
                      <button type="button" onClick={() => navigate(efficiencyTarget('oee', line))} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]">{formatPercent(summary.oee)}</button>
                    </td>
                    <td className="px-2 py-3 text-center whitespace-nowrap"><button type="button" onClick={() => navigate(efficiencyTarget('upph', line))} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]">{formatNumber(summary.upph, 1)}</button></td>
                    <td className="px-2 py-3 text-center whitespace-nowrap">{formatPercent(summary.yieldRate)}</td>
                    <td className={`px-2 py-3 text-center whitespace-nowrap ${metricValueClass(getMetricLevel('downtime', summary.downtimeRatio))}`}>
                      {formatNumber(summary.downtimeHours * 60)} min
                    </td>
                    <td className={`px-2 py-3 text-center whitespace-nowrap ${summary.laborGap < 0 ? 'text-[#950000]' : ''}`}>
                      <button type="button" onClick={() => navigate(efficiencyTarget('labor-gap', line))} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]">{summary.laborGap > 0 ? '+' : ''}{formatNumber(summary.laborGap, 1)}h</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[#d5d5d5] bg-white p-5">
          <h3 className="font-bold text-[#1e1e1e]">重点风险聚焦</h3>
          <p className="mt-0.5 text-xs text-[#787777]">优先处理对产能影响最大的项目</p>
          <div className="mt-4 divide-y divide-[#e5e3dc]">
            <button
              type="button"
              onClick={() => navigate(anomalyTarget({ line: largestLossLine?.line }))}
              className="group flex w-full items-center justify-between gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]"
            >
              <span>
                <span className="block text-xs text-[#787777]">最大损失产线</span>
                <span className="mt-1 block font-semibold text-[#1e1e1e]">
                  {largestLossLine ? `${largestLossLine.line} · 损失 ${formatNumber(largestLossLine.theoreticalLoss)} 件` : '暂无数据'}
                </span>
              </span>
              <ArrowRight size={17} className="text-[#787777] transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              onClick={() => navigate(anomalyTarget())}
              className="group flex w-full items-center justify-between gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]"
            >
              <span>
                <span className="block text-xs text-[#787777]">最大损失类型</span>
                <span className="mt-1 block font-semibold text-[#1e1e1e]">
                  {anomalyInsights.largestType
                    ? `${getAnomalyTypeName(settings, anomalyInsights.largestType[0])} · ${formatNumber(anomalyInsights.largestType[1])} min`
                    : '暂无停线异常'}
                </span>
              </span>
              <ArrowRight size={17} className="text-[#787777] transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              onClick={() => navigate(anomalyTarget({ line: anomalyInsights.largestStation?.line, station: anomalyInsights.largestStation?.station }))}
              className="group flex w-full items-center justify-between gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]"
            >
              <span>
                <span className="block text-xs text-[#787777]">最大影响工位</span>
                <span className="mt-1 block font-semibold text-[#1e1e1e]">
                  {anomalyInsights.largestStation
                    ? `${anomalyInsights.largestStation.station}（${anomalyInsights.largestStation.line}）· ${formatNumber(anomalyInsights.largestStation.minutes)} min`
                    : '暂无停线异常'}
                </span>
              </span>
              <ArrowRight size={17} className="text-[#787777] transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d5d5d5] bg-white">
        <div className="flex items-center justify-between border-b border-[#d5d5d5] px-5 py-4">
          <div>
            <h3 className="font-bold text-[#1e1e1e]">遗留待处理事项</h3>
            <p className="mt-0.5 text-xs text-[#787777]">仅展示待处理与处理中的异常</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/anomalies')}
            className="text-sm font-medium text-[#9b7000] hover:text-[#1e1e1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]"
          >
            查看全部
          </button>
        </div>
        {openAnomalies.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[#787777]">当前没有未关闭异常</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-[#f5f4ef] text-[#787777]">
                <tr>
                  {['异常编号', '状态', '产线', '工位名称', '异常类型', '停线时长', '责任部门', '操作'].map((header) => (
                    <th key={header} className="px-4 py-3 text-center font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openAnomalies.map((anomaly) => (
                  <tr key={anomaly.id} className="border-t border-[#e5e3dc] hover:bg-[#fff9df]">
                    <td className="px-4 py-3 text-center font-semibold text-[#1e1e1e]">{anomaly.id}</td>
                    <td className={`px-4 py-3 text-center font-medium ${anomaly.status === 'pending' ? 'text-[#950000]' : 'text-[#9b7000]'}`}>
                      {anomaly.status === 'pending' ? '待处理' : '处理中'}
                    </td>
                    <td className="px-4 py-3 text-center">{anomaly.line}</td>
                    <td className="px-4 py-3 text-center">{anomaly.stationName || '—'}</td>
                    <td className="px-4 py-3 text-center">{getAnomalyTypeName(settings, anomaly.type)}</td>
                    <td className="px-4 py-3 text-center">{formatNumber(anomaly.impactMinutes)} min</td>
                    <td className="px-4 py-3 text-center">{anomaly.department}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => navigate(anomalyTarget({ line: anomaly.line, station: anomaly.stationName, anomalyId: anomaly.id }))}
                        className="rounded-md border border-[#d5d5d5] px-3 py-1.5 text-xs font-medium text-[#1e1e1e] hover:border-[#e1a300] hover:bg-[#fff9df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]"
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
