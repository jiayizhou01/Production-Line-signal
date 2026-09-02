import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const pages = ['pages/DailyReport.tsx', 'pages/Dashboard.tsx', 'pages/EfficiencyAnalysis.tsx', 'pages/AnomalyManagement.tsx', 'pages/AIAssistant.tsx', 'components/AnomalyAnalytics.tsx']

pages.forEach((page) => {
  const source = read(`src/${page}`)
  assert(!source.includes('mockDailyReports') && !source.includes('mockAnomalies'), `${page} still reads mock data directly`)
  assert(source.includes('useAppData') || page === 'components/AnomalyAnalytics.tsx', `${page} is not connected to the shared store`)
})

const repository = read('src/data/repository.ts')
const types = read('src/types/index.ts')
;['productionReports', 'anomalies', 'actions', 'aiMessages', 'settings', 'users'].forEach((store) => assert(repository.includes(`'${store}'`), `missing IndexedDB store: ${store}`))

const assistant = read('src/pages/AIAssistant.tsx')
const evidence = read('src/services/aiEvidence.ts')
const conversation = read('src/services/aiConversation.ts')
const dailyReport = read('src/pages/DailyReport.tsx')
const anomalyManagement = read('src/pages/AnomalyManagement.tsx')
assert(assistant.includes('EvidenceCards') && assistant.includes('appStore.createAiMessage'), 'AI assistant must persist messages and render evidence cards')
assert(assistant.includes('conversationId') && assistant.includes('dataContext') && assistant.includes('清空对话记录') && assistant.includes('appStore.clearAiMessages'), 'AI assistant must persist conversation context and provide confirmed local history clearing')
assert(evidence.includes('getEvidenceState') && evidence.includes('contextPath'), 'AI evidence must validate sources and use navigation context')
assert(types.includes("export type ChatDataContext = 'seed' | 'manual' | 'mixed' | 'empty' | 'unknown'") && conversation.includes('getAiDataContext') && conversation.includes('normalizeAiMessages'), 'AI conversation context must support current and migrated records')
assert(dailyReport.includes('appStore.updateProductionReport') && dailyReport.includes('appStore.deleteProductionReport') && dailyReport.includes('createEditForm'), 'daily reports must use the shared store for edit and delete')
assert(anomalyManagement.includes('appStore.deleteAnomaly') && anomalyManagement.includes('confirmDeleteAnomaly'), 'anomalies must use the shared store for confirmed deletion')

const kpiService = read('src/services/kpiService.ts')
assert(!kpiService.includes('analyzeOeeDecline') && !kpiService.includes('getTodayReports'), 'legacy simple-average OEE helper must not exist')
assert(!kpiService.includes("today = '2026-07-26'"), 'KPI service must not contain a hard-coded reporting date')
assert(kpiService.includes('getProductionWeightedCt(reports)') && kpiService.includes('idealProductionHours / calendarOpenHours'), 'KPI aggregation must derive CT and OEE from base quantities and time')
assert(kpiService.includes('const calendarOpenHours = Math.max(0, report.shiftHours)') && kpiService.includes('const lineAvailableHours = Math.max(0, calendarOpenHours - report.mealBreakHours)'), 'time formulas must use shift hours for calendar time and subtract only meal breaks for available line time')
assert(!kpiService.includes('calendarOpenHours - report.downtime'), 'planned downtime must not reduce available line time')
assert(evidence.includes('summarizeReports(scoped.filter'), 'AI UPPH trend must use the shared KPI aggregation')
assert(repository.includes('assertUniqueReportSlot') && repository.includes('多型号请在同一张日报中维护产品明细'), 'repository must enforce one report per date, line, and shift')
assert(repository.includes('initializeDatabase') && repository.includes('const productionReports: DailyReport[] = []'), 'a new browser database must start without demo reports')
assert(repository.includes('loadDemoData') && repository.includes('clearDemoData') && repository.includes("report.dataSource === 'seed'") && repository.includes("anomaly.dataSource === 'seed'"), 'demo data must be explicitly loadable and removable without deleting manual data')
assert(repository.includes('lines: []') && repository.includes('productModels: []') && repository.includes('departments: []') && repository.includes('stations: []') && repository.includes('anomalyTypes: []'), 'a new browser database must start with empty business reference data')
assert(repository.includes('saveReferenceData') && repository.includes("database.transaction(['productionReports', 'anomalies', 'settings'], 'readwrite')"), 'reference-data updates must be persisted atomically with report and anomaly associations')
assert(repository.includes('seedReferenceValues') && repository.includes('manualReports') && repository.includes('referencedTypeIds'), 'clearing demo data must preserve manual records and referenced reference data')
assert(repository.includes('SCHEMA_VERSION = 8') && repository.includes("indicatorFormulaVersion: 'v2-calendar-shift'") && repository.includes("message.dataContext === 'seed'") && repository.includes('clearAiMessages'), 'formula version and demo clearing must be migrated safely')
assert(read('src/types/index.ts').includes('AnomalyTypeDefinition') && read('src/services/referenceData.ts').includes('getAnomalyTypeName'), 'anomaly types must use stable, configurable reference data')
console.log('Data architecture check passed: shared store, persistent AI messages, and traceable evidence are defined.')
