import type { Anomaly, AppSettings, ComputedReport, DailyReport, EvidenceRef } from '../types'
import { computeAllReports, formatNumber, formatPercent, getReportTimeSummary, summarizeReports } from './kpiService'
import { getAnomalyRecurrence } from './anomalyRecurrence'
import { contextPath } from './navigationContext'
import { getAnomalyTypeName } from './referenceData'

export type AiReply = {
  content: string
  evidenceRefs: EvidenceRef[]
  isSuggestion?: boolean
  defaultRange?: string
}

type AiData = {
  reports: DailyReport[]
  anomalies: Anomaly[]
  settings: AppSettings | null
}

const latestDate = (reports: ComputedReport[]) => Array.from(new Set(reports.map((report) => report.date))).sort().at(-1)
const dateRange = (reports: ComputedReport[]) => {
  const dates = reports.map((report) => report.date).sort()
  return dates.length ? `${dates[0]} 至 ${dates.at(-1)}` : '未指定范围'
}
const byLine = (value: string, reports: ComputedReport[]) => reports.find((report) => report.line.toLowerCase() === value.toLowerCase())?.line

const reportRef = (report: ComputedReport, settings: AppSettings | null, metricName?: string, metricValue?: string, unit?: string): EvidenceRef => ({
  id: `${metricName ?? 'report'}-${report.id}`,
  sourceType: metricName ? 'metric' : 'productionReport',
  sourceId: report.id,
  title: metricName ? `${metricName} ${metricValue ?? ''} · ${report.date} · ${report.line}${report.shift ? ` · ${report.shift}` : ''}` : `生产日报 · ${report.date} · ${report.line}${report.shift ? ` · ${report.shift}` : ''}`,
  date: report.date,
  line: report.line,
  shift: report.shift,
  metricName,
  metricValue,
  unit,
  dataSource: report.dataSource,
  updatedAt: report.updatedAt,
  formulaVersion: metricName ? settings?.indicatorFormulaVersion : undefined,
  link: metricName
    ? contextPath('/efficiency', { date: report.date, line: report.line, shift: report.shift, metric: metricName === 'OEE' ? 'oee' : metricName === 'UPPH' ? 'upph' : metricName === '良率' ? 'yield' : metricName === '标准挣得工时' || metricName === '人力效率' ? 'labor-gap' : 'achievement', source: 'ai' })
    : contextPath('/daily-report', { date: report.date, line: report.line, shift: report.shift, source: 'ai' })
})

const anomalyRef = (anomaly: Anomaly): EvidenceRef => ({
  id: `anomaly-${anomaly.id}`,
  sourceType: 'anomaly',
  sourceId: anomaly.id,
  title: `异常 ${anomaly.id} · ${anomaly.stationName || '未填写工位'} · 停线 ${anomaly.impactMinutes} 分钟`,
  date: anomaly.startTime.slice(0, 10),
  line: anomaly.line,
  shift: anomaly.shift,
  station: anomaly.stationName,
  dataSource: anomaly.dataSource,
  updatedAt: anomaly.updatedAt,
  link: contextPath('/anomalies', { anomalyId: anomaly.id, date: anomaly.startTime.slice(0, 10), line: anomaly.line, shift: anomaly.shift, station: anomaly.stationName, source: 'ai' })
})

const insufficient = (reason: string): AiReply => ({ content: `当前数据不足：${reason}`, evidenceRefs: [] })

const latestReports = (reports: ComputedReport[]) => {
  const date = latestDate(reports)
  return date ? reports.filter((report) => report.date === date) : []
}

const respondLowestOeeYesterday = (reports: ComputedReport[], settings: AppSettings | null): AiReply => {
  const dates = Array.from(new Set(reports.map((report) => report.date))).sort()
  const date = dates.at(-2)
  if (!date) return insufficient('至少需要两个有日报数据的日期，才能比较“昨天”。')
  const candidates = reports.filter((report) => report.date === date)
  const lowest = [...candidates].sort((left, right) => left.oee - right.oee)[0]
  if (!lowest) return insufficient(`${date} 没有生产日报。`)
  return {
    content: `按数据中最近日报 ${dates.at(-1)} 的前一有数据日期计算，“昨天”为 ${date}。OEE 最低的是 ${lowest.line}${lowest.shift ? ` · ${lowest.shift}` : ''}，为 ${formatPercent(lowest.oee)}。OEE 口径：合格品 × CT ÷ 日历开线时长（${settings?.indicatorFormulaVersion ?? '当前公式版本'}）。`,
    evidenceRefs: [reportRef(lowest, settings, 'OEE', formatPercent(lowest.oee), '%'), reportRef(lowest, settings)],
    defaultRange: date
  }
}

const respondLineUpphTrend = (line: string, reports: ComputedReport[], anomalies: Anomaly[], settings: AppSettings | null): AiReply => {
  const lineReports = reports.filter((report) => report.line === line).sort((left, right) => left.date.localeCompare(right.date))
  const dates = Array.from(new Set(lineReports.map((report) => report.date))).slice(-7)
  const scoped = lineReports.filter((report) => dates.includes(report.date))
  if (scoped.length < 2) return insufficient(`${line} 最近 7 个有日报日期的 UPPH 数据不足。`)
  const startDate = dates.at(0) ?? scoped[0].date
  const endDate = dates.at(-1) ?? scoped.at(-1)!.date
  const pivot = Math.max(1, Math.floor(dates.length / 2))
  const firstDates = dates.slice(0, pivot)
  const lastDates = dates.slice(pivot)
  const before = summarizeReports(scoped.filter((report) => firstDates.includes(report.date))).upph
  const after = summarizeReports(scoped.filter((report) => lastDates.includes(report.date))).upph
  const delta = before > 0 ? after / before - 1 : 0
  const relatedAnomalies = anomalies.filter((anomaly) => anomaly.line === line && anomaly.startTime.slice(0, 10) >= startDate && anomaly.startTime.slice(0, 10) <= endDate).sort((left, right) => right.impactMinutes - left.impactMinutes)
  const evidence = [reportRef(scoped.at(-1)!, settings, 'UPPH', formatNumber(after, 1), '件/人·时'), ...relatedAnomalies.slice(0, 2).map(anomalyRef)]
  const topAnomaly = relatedAnomalies[0]
  const anomalyNote = topAnomaly ? `同期登记的最大停线异常为 ${topAnomaly.id}，${topAnomaly.impactMinutes} 分钟。` : '同期未登记停线异常。'
  return {
    content: `${line} 最近 7 个有日报日期（${startDate} 至 ${endDate}）的 UPPH 前半段均值为 ${formatNumber(before, 1)}，后半段为 ${formatNumber(after, 1)}，变化 ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%。${anomalyNote}\n\n分析建议：优先核对停线、人员工时和产品 CT 变化；这是一项数据推断，并非已确认根因。`,
    evidenceRefs: evidence,
    isSuggestion: true,
    defaultRange: `${startDate} 至 ${endDate}`
  }
}

const respondLongestStation = (anomalies: Anomaly[]): AiReply => {
  const groups = new Map<string, Anomaly[]>()
  anomalies.filter((anomaly) => anomaly.impactType !== 'nonstop' && anomaly.impactMinutes > 0 && anomaly.stationName).forEach((anomaly) => {
    const key = `${anomaly.line}|${anomaly.stationName}`
    groups.set(key, [...(groups.get(key) ?? []), anomaly])
  })
  const winner = [...groups.values()].map((items) => ({ items, total: items.reduce((sum, item) => sum + item.impactMinutes, 0) })).sort((left, right) => right.total - left.total)[0]
  if (!winner) return insufficient('没有包含工位名称且发生停线的异常记录。')
  const sample = [...winner.items].sort((left, right) => right.impactMinutes - left.impactMinutes)[0]
  return {
    content: `当前全部异常记录中，累计停线时间最长的工位是 ${sample.line} · ${sample.stationName}，累计 ${winner.total} 分钟，共 ${winner.items.length} 条停线记录。统计范围：${winner.items.map((item) => item.startTime.slice(0, 10)).sort().at(0)} 至 ${winner.items.map((item) => item.startTime.slice(0, 10)).sort().at(-1)}。`,
    evidenceRefs: winner.items.sort((left, right) => right.impactMinutes - left.impactMinutes).slice(0, 3).map(anomalyRef)
  }
}

const respondMostRecurring = (anomalies: Anomaly[], settings: AppSettings | null): AiReply => {
  const winner = anomalies.map((anomaly) => ({ anomaly, recurrence: getAnomalyRecurrence(anomaly, anomalies) })).sort((left, right) => right.recurrence.recurrenceCount - left.recurrence.recurrenceCount)[0]
  if (!winner || winner.recurrence.recurrenceCount === 0) return insufficient('当前记录中没有满足 30 天复发规则的异常。')
  return {
    content: `最近重复发生最多的是 ${getAnomalyTypeName(settings, winner.anomaly.type)}：${winner.anomaly.line} · ${winner.anomaly.stationName || '未填写工位'}。按同产线、同工位、同异常类型的 30 天规则，该记录发生前已有 ${winner.recurrence.recurrenceCount} 次相关异常。`,
    evidenceRefs: [anomalyRef(winner.anomaly), ...winner.recurrence.relatedAnomalies.slice(0, 2).map(anomalyRef)]
  }
}

const respondLaborAndUpph = (reports: ComputedReport[], settings: AppSettings | null): AiReply => {
  if (!reports.length) return insufficient('没有生产日报。')
  const upphValues = reports.map((report) => report.upph).sort((left, right) => left - right)
  const median = upphValues[Math.floor(upphValues.length / 2)]
  const matches = reports.filter((report) => {
    const time = getReportTimeSummary(report)
    return time.actualLaborHours > time.theoreticalLaborHours && report.upph < median
  }).sort((left, right) => left.upph - right.upph)
  if (!matches.length) return insufficient(`未找到“实际出勤工时高于理论工时且 UPPH 低于样本中位数 ${formatNumber(median, 1)}”的班次。`)
  return {
    content: `以下班次满足“实际出勤工时高于理论工时、且 UPPH 低于当前样本中位数 ${formatNumber(median, 1)}”的条件：${matches.slice(0, 3).map((report) => `${report.date} · ${report.line} · ${report.shift ?? '未设班次'}（UPPH ${formatNumber(report.upph, 1)}，标准挣得 ${formatNumber(report.standardEarnedLaborHours, 1)}h，人力效率 ${formatPercent(report.laborEfficiency)}）`).join('；')}。`,
    evidenceRefs: matches.slice(0, 3).flatMap((report) => [
      reportRef(report, settings, 'UPPH', formatNumber(report.upph, 1), '件/人·时'),
      reportRef(report, settings, '标准挣得工时', formatNumber(report.standardEarnedLaborHours, 1), '小时'),
      reportRef(report, settings, '人力效率', formatPercent(report.laborEfficiency), '%')
    ]),
    defaultRange: dateRange(matches)
  }
}

const respondLaborEfficiency = (reports: ComputedReport[], settings: AppSettings | null): AiReply => {
  if (!reports.length) return insufficient('没有生产日报。')
  const lowest = [...reports].sort((left, right) => left.laborEfficiency - right.laborEfficiency)[0]
  if (!lowest) return insufficient('没有可计算人力效率的生产日报。')
  return {
    content: `当前样本中人力效率最低的是 ${lowest.date} · ${lowest.line} · ${lowest.shift ?? '未设班次'}：标准挣得工时 ${formatNumber(lowest.standardEarnedLaborHours, 1)}h，实际出勤总工时 ${formatNumber(getReportTimeSummary(lowest).actualLaborHours, 1)}h，人力效率 ${formatPercent(lowest.laborEfficiency)}。标准挣得工时口径：Σ（各型号实际入库数 × CT × 线体定编人数）。`,
    evidenceRefs: [
      reportRef(lowest, settings, '标准挣得工时', formatNumber(lowest.standardEarnedLaborHours, 1), '小时'),
      reportRef(lowest, settings, '人力效率', formatPercent(lowest.laborEfficiency), '%'),
      reportRef(lowest, settings)
    ],
    defaultRange: lowest.date
  }
}

export function generateAiReply(question: string, data: AiData): AiReply {
  const reports = computeAllReports(data.reports, data.anomalies)
  const lower = question.toLowerCase()
  if (!reports.length && !data.anomalies.length) return insufficient('生产日报和异常记录均为空。')
  if ((question.includes('昨天') || question.includes('昨日')) && lower.includes('oee') && (question.includes('最低') || question.includes('哪条'))) return respondLowestOeeYesterday(reports, data.settings)
  if (lower.includes('upph') && (question.includes('最近') || question.includes('下降') || question.includes('为什么'))) {
    const requestedLine = question.match(/line-[a-z]/i)?.[0]
    const line = requestedLine ? byLine(requestedLine, reports) : undefined
    return line ? respondLineUpphTrend(line, reports, data.anomalies, data.settings) : insufficient('请指定要分析的产线，例如 Line-A。')
  }
  if (question.includes('工位') && (question.includes('最长') || question.includes('停线'))) return respondLongestStation(data.anomalies)
  if (question.includes('重复') || question.includes('复发')) return respondMostRecurring(data.anomalies, data.settings)
  if (question.includes('逾期') || question.includes('责任行动')) return insufficient('当前未启用责任行动模块，因此没有可判断的逾期责任行动数据。')
  if (question.includes('标准挣得') || question.includes('人力效率')) return respondLaborEfficiency(reports, data.settings)
  if (question.includes('人力') && lower.includes('upph')) return respondLaborAndUpph(reports, data.settings)

  const latest = latestReports(reports)
  if (!latest.length) return insufficient('没有可用于分析的最近生产日报。')
  const summary = summarizeReports(latest)
  const highestLoss = [...data.anomalies].sort((left, right) => right.impactMinutes - left.impactMinutes)[0]
  return {
    content: `默认统计范围为最近有日报日期 ${latest[0].date}，覆盖 ${new Set(latest.map((report) => report.line)).size} 条产线记录。计划达成率 ${formatPercent(summary.achievementRate)}，OEE ${formatPercent(summary.oee)}，UPPH ${formatNumber(summary.upph, 1)}。OEE 使用 ${data.settings?.indicatorFormulaVersion ?? '当前公式版本'}。${highestLoss ? `最大单条停线异常为 ${highestLoss.id}，${highestLoss.impactMinutes} 分钟。` : '当前未发现异常记录。'}\n\n分析建议：可先查看 OEE 较低的产线与停线异常；该建议基于当前已录入数据。`,
    evidenceRefs: [...latest.slice(0, 3).map((report) => reportRef(report, data.settings, 'OEE', formatPercent(report.oee), '%')), ...(highestLoss ? [anomalyRef(highestLoss)] : [])],
    isSuggestion: true,
    defaultRange: latest[0].date
  }
}

export function getEvidenceState(ref: EvidenceRef, data: AiData) {
  const source = ref.sourceType === 'anomaly'
    ? data.anomalies.find((anomaly) => anomaly.id === ref.sourceId)
    : ref.sourceType === 'productionReport' || ref.sourceType === 'metric'
      ? data.reports.find((report) => report.id === ref.sourceId)
      : undefined
  if (!source) return 'deleted' as const
  return source.updatedAt === ref.updatedAt ? 'current' as const : 'updated' as const
}
