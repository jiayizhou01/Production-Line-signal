import type { DailyReport, ComputedReport, KpiSummary, Anomaly, KpiAggregate } from '../types'
import { downtimeKey, getAnomalyDowntimeHoursByShift } from './anomalyDowntime'

type CtWeightedItem = { goodQty: number; lineCt: number }

/**
 * Canonical CT numerator: actual inbound quantity × CT.
 * Every report, day, line, and shift aggregation must use this instead of
 * averaging CT values from individual reports.
 */
export function getCtWeightedNumerator(items: CtWeightedItem[]) {
  return items.reduce((sum, item) => sum + Math.max(0, item.goodQty) * item.lineCt, 0)
}

export function getProductionWeightedCt(items: CtWeightedItem[]) {
  const totalGoodQty = items.reduce((sum, item) => sum + Math.max(0, item.goodQty), 0)
  return totalGoodQty > 0 ? getCtWeightedNumerator(items) / totalGoodQty : 0
}

export function getReportTimeSummary(report: Pick<DailyReport, 'shiftHours' | 'mealBreakHours' | 'operators' | 'staffing'>) {
  const calendarOpenHours = Math.max(0, report.shiftHours)
  const lineAvailableHours = Math.max(0, calendarOpenHours - report.mealBreakHours)
  return {
    calendarOpenHours,
    lineAvailableHours,
    actualLaborHours: report.operators * lineAvailableHours,
    theoreticalLaborHours: (report.staffing ?? report.operators) * lineAvailableHours
  }
}

/**
 * 标准挣得工时：Σ(各型号合格品 × 标准 CT × 线体定编人数)。
 * CT 的内部单位为小时/件，结果为小时。
 */
export function getStandardEarnedLaborHours(items: CtWeightedItem[], staffing: number) {
  return Math.max(0, staffing) * getCtWeightedNumerator(items)
}

export function computeReport(report: DailyReport): ComputedReport {
  const productDetails = report.productDetails?.length
    ? report.productDetails
    : [{
        productModel: report.productModel,
        plannedQty: report.plannedQty,
        actualQty: report.actualQty,
        defectQty: report.defectQty,
        lineCt: report.lineCt
      }]
  const plannedQty = productDetails.reduce((sum, detail) => sum + detail.plannedQty, 0)
  const actualQty = productDetails.reduce((sum, detail) => sum + detail.actualQty, 0)
  const goodQty = productDetails.reduce((sum, detail) => sum + Math.max(0, detail.actualQty - detail.defectQty), 0)
  const weightedLineCt = getProductionWeightedCt(productDetails.map((detail) => ({
    goodQty: Math.max(0, detail.actualQty - detail.defectQty),
    lineCt: detail.lineCt
  })))
  const { calendarOpenHours: calendarOpenTime, lineAvailableHours: lineAvailableTime, actualLaborHours } = getReportTimeSummary(report)
  const standardEarnedLaborHours = getStandardEarnedLaborHours(
    productDetails.map((detail) => ({ goodQty: Math.max(0, detail.actualQty - detail.defectQty), lineCt: detail.lineCt })),
    report.staffing ?? report.operators
  )
   const achievementRate = plannedQty > 0 ? actualQty / plannedQty : 0
   const yieldRate = actualQty > 0 ? goodQty / actualQty : 0
  const ct = weightedLineCt
  const availability = calendarOpenTime > 0 ? lineAvailableTime / calendarOpenTime : 0
  const oee = calendarOpenTime > 0 ? (goodQty * weightedLineCt) / calendarOpenTime : 0
  const upph = actualLaborHours > 0 ? goodQty / actualLaborHours : 0
   const perCapitaEfficiency = report.operators > 0 ? goodQty / report.operators : 0

   return {
     ...report,
     productModel: productDetails.map((detail) => detail.productModel).join(' / '),
     plannedQty,
     actualQty,
     defectQty: actualQty - goodQty,
     lineCt: weightedLineCt,
     goodQty,
     achievementRate,
     yieldRate,
    ct,
    availability,
    oee,
     upph,
    perCapitaEfficiency,
    anomalyDowntimeHours: 0,
    totalDowntimeHours: Math.max(0, report.downtime),
    standardEarnedLaborHours,
    laborEfficiency: actualLaborHours > 0 ? standardEarnedLaborHours / actualLaborHours : 0
   }
 }

export function computeAllReports(reports: DailyReport[], anomalies: Anomaly[] = []): ComputedReport[] {
  const abnormalHours = getAnomalyDowntimeHoursByShift(anomalies)
  return reports.map((report) => {
    const computed = computeReport(report)
    const anomalyDowntimeHours = abnormalHours.get(downtimeKey(report.date, report.line, report.shift)) ?? 0
    return {
      ...computed,
      anomalyDowntimeHours,
      totalDowntimeHours: Math.max(0, report.downtime) + anomalyDowntimeHours
    }
  })
 }

export function filterReports(
  reports: ComputedReport[],
  filters: { startDate?: string; endDate?: string; line?: string; shift?: string; productModel?: string }
): ComputedReport[] {
  return reports.filter((r) => {
    if (filters.startDate && r.date < filters.startDate) return false
    if (filters.endDate && r.date > filters.endDate) return false
    if (filters.line && r.line !== filters.line) return false
    if (filters.shift && r.shift !== filters.shift) return false
    if (filters.productModel && !(r.productDetails?.some((detail) => detail.productModel === filters.productModel) ?? r.productModel === filters.productModel)) return false
    return true
  })
}

export function summarizeReports(reports: ComputedReport[]): KpiAggregate {
  const plannedQty = reports.reduce((sum, report) => sum + report.plannedQty, 0)
  const actualQty = reports.reduce((sum, report) => sum + report.actualQty, 0)
  const goodQty = reports.reduce((sum, report) => sum + report.goodQty, 0)
  const timeSummaries = reports.map(getReportTimeSummary)
  const calendarOpenHours = timeSummaries.reduce((sum, time) => sum + time.calendarOpenHours, 0)
  const plannedDowntimeHours = reports.reduce((sum, report) => sum + Math.max(0, report.downtime), 0)
  const anomalyDowntimeHours = reports.reduce((sum, report) => sum + report.anomalyDowntimeHours, 0)
  const downtimeHours = reports.reduce((sum, report) => sum + report.totalDowntimeHours, 0)
  const actualLaborHours = timeSummaries.reduce((sum, time) => sum + time.actualLaborHours, 0)
  const theoreticalLaborHours = timeSummaries.reduce((sum, time) => sum + time.theoreticalLaborHours, 0)
  const standardEarnedLaborHours = reports.reduce((sum, report) => sum + report.standardEarnedLaborHours, 0)
  const idealProductionHours = getCtWeightedNumerator(reports)

  return {
    plannedQty,
    actualQty,
    goodQty,
    defectQty: Math.max(0, actualQty - goodQty),
    achievementRate: plannedQty > 0 ? actualQty / plannedQty : 0,
    oee: calendarOpenHours > 0 ? idealProductionHours / calendarOpenHours : 0,
    upph: actualLaborHours > 0 ? goodQty / actualLaborHours : 0,
    yieldRate: actualQty > 0 ? goodQty / actualQty : 0,
    downtimeHours,
    downtimeRatio: calendarOpenHours > 0 ? downtimeHours / calendarOpenHours : 0,
    plannedDowntimeHours,
    anomalyDowntimeHours,
    actualLaborHours,
    theoreticalLaborHours,
    standardEarnedLaborHours,
    laborEfficiency: actualLaborHours > 0 ? standardEarnedLaborHours / actualLaborHours : 0,
    laborGap: actualLaborHours - theoreticalLaborHours,
    weightedCt: getProductionWeightedCt(reports)
  }
}

function toKpiSummary(reports: ComputedReport[], date: string, line: string): KpiSummary {
  const summary = summarizeReports(reports)
  const timeSummaries = reports.map(getReportTimeSummary)
  const calendarOpenHours = timeSummaries.reduce((sum, time) => sum + time.calendarOpenHours, 0)
  const lineAvailableHours = timeSummaries.reduce((sum, time) => sum + time.lineAvailableHours, 0)
  const operators = reports.reduce((sum, report) => sum + report.operators, 0)

  return {
    date,
    line,
    productModel: '全部型号',
    plannedQty: summary.plannedQty,
    actualQty: summary.actualQty,
    goodQty: summary.goodQty,
    achievementRate: summary.achievementRate,
    yieldRate: summary.yieldRate,
    oee: summary.oee,
    ct: summary.weightedCt,
    availability: calendarOpenHours > 0 ? lineAvailableHours / calendarOpenHours : 0,
    upph: summary.upph,
    perCapitaEfficiency: operators > 0 ? summary.goodQty / operators : 0
  }
}

export function aggregateByDate(reports: ComputedReport[]): KpiSummary[] {
  const grouped = new Map<string, ComputedReport[]>()
  reports.forEach((report) => grouped.set(report.date, [...(grouped.get(report.date) ?? []), report]))
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, items]) => toKpiSummary(items, date, '全部产线'))
}

function aggregateByGroup(reports: ComputedReport[], getLabel: (report: ComputedReport) => string): KpiSummary[] {
  const grouped = new Map<string, ComputedReport[]>()
  reports.forEach((report) => {
    const label = getLabel(report)
    grouped.set(label, [...(grouped.get(label) ?? []), report])
  })
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([line, items]) => toKpiSummary(items, items.map((report) => report.date).sort()[0], line))
}

export function aggregateByLine(reports: ComputedReport[]): KpiSummary[] {
  return aggregateByGroup(reports, (report) => report.line)
}

export function aggregateByShift(reports: ComputedReport[]): KpiSummary[] {
  return aggregateByGroup(reports, (report) => report.shift ?? '未设置班次')
}

export function formatPercent(value: number, digits = 1) {
   return `${(value * 100).toFixed(digits)}%`
 }

 export function formatNumber(value: number, digits = 0) {
   return value.toFixed(digits)
 }
