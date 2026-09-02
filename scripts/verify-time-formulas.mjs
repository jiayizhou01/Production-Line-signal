import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const root = new URL('../', import.meta.url)
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const assertClose = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, received ${actual}`)

const anomalyDowntimeModule = `export const downtimeKey = () => ''; export const getAnomalyDowntimeHoursByShift = () => new Map();`
const dependencyUrl = `data:text/javascript,${encodeURIComponent(anomalyDowntimeModule)}`
const kpiSource = readFileSync(new URL('src/services/kpiService.ts', root), 'utf8')
const kpiModule = stripTypeScriptTypes(kpiSource, { mode: 'transform' })
  .replace(/from ['"]\.\/anomalyDowntime['"];?/, `from "${dependencyUrl}";`)
const { computeReport, getReportTimeSummary, summarizeReports } = await import(`data:text/javascript,${encodeURIComponent(kpiModule)}`)

const report = {
  id: 'time-formula-check', date: '2026-09-02', shift: '白班', line: 'Line-A', productModel: 'Model-A',
  plannedQty: 500, actualQty: 500, productionTime: 10, downtime: 0.5, operators: 8, staffing: 10,
  defectQty: 20, lineCt: 1 / 60, shiftHours: 10, mealBreakHours: 1, restBreakHours: 0,
  productDetails: [{ productModel: 'Model-A', plannedQty: 500, actualQty: 500, defectQty: 20, lineCt: 1 / 60 }]
}

const time = getReportTimeSummary(report)
assertClose(time.calendarOpenHours, 10, 'calendar open hours must equal shift hours')
assertClose(time.lineAvailableHours, 9, 'available line hours must subtract only meal breaks')
assertClose(time.actualLaborHours, 72, 'actual labor hours must use available line hours')
assertClose(time.theoreticalLaborHours, 90, 'theoretical labor hours must use available line hours')
assertClose(getReportTimeSummary({ ...report, downtime: 3 }).lineAvailableHours, 9, 'planned downtime must not change available line hours')

const computed = computeReport(report)
assertClose(computed.oee, 0.8, 'OEE denominator must use full shift hours')
assertClose(computed.upph, 480 / 72, 'UPPH denominator must use actual labor hours after meal breaks')
assertClose(computed.totalDowntimeHours, 0.5, 'planned downtime must remain an independently tracked loss')
const summary = summarizeReports([computed])
assertClose(summary.oee, 0.8, 'aggregate OEE must recompute from base quantities and calendar hours')
assertClose(summary.upph, 480 / 72, 'aggregate UPPH must recompute from base quantities and labor hours')
assertClose(summary.downtimeRatio, 0.05, 'downtime ratio must use full shift hours as its denominator')

console.log('Time formula check passed: calendar time uses shift hours; available time subtracts meal breaks only.')
