import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const root = new URL('../', import.meta.url)
const source = readFileSync(new URL('src/data/mockData.ts', root), 'utf8')
const code = stripTypeScriptTypes(source, { mode: 'transform' })
const { mockDailyReports, mockAnomalies } = await import(`data:text/javascript,${encodeURIComponent(code)}`)
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const dates = mockDailyReports.map((report) => report.date).sort()
assert(dates[0] === '2026-06-10' && dates.at(-1) === '2026-08-10', '日报日期范围必须为 2026-06-10 至 2026-08-10')
assert(mockDailyReports.length === 372, `日报数量应为 372，实际为 ${mockDailyReports.length}`)
assert(new Set(mockDailyReports.map((report) => `${report.date}-${report.line}-${report.shift}`)).size === 372, '每个日期、产线、班次必须只有一条日报')
assert(mockDailyReports.some((report) => report.productDetails && report.productDetails.length > 1), '必须包含多型号日报')
assert(mockAnomalies.length >= 124, '异常记录数量不足')
assert(mockAnomalies.some((anomaly) => anomaly.impactType === 'nonstop') && mockAnomalies.some((anomaly) => anomaly.status === 'pending') && mockAnomalies.some((anomaly) => anomaly.stationName), '异常记录必须覆盖未停线、待处理和工位')
console.log(`Demo data check passed: ${mockDailyReports.length} reports, ${mockAnomalies.length} anomalies from ${dates[0]} to ${dates.at(-1)}.`)
