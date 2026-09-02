import { DEPARTMENTS, DEMO_ANOMALY_TYPES, DEMO_DEFAULT_CT_SECONDS, DEMO_STATIONS, LINES, PRODUCT_MODELS, mockAnomalies, mockDailyReports } from './mockData'
import type { Action, Anomaly, AppSettings, AppUser, AuditFields, ChatMessage, DailyReport, SeedReferenceValues } from '../types'
import type { ReferenceDataKind } from '../services/referenceData'
import { normalizeAiMessages } from '../services/aiConversation'

const DB_NAME = 'manufacturing-operations'
const DB_VERSION = 2
const SCHEMA_VERSION = 8
const CURRENT_USER = '本地用户'
const STORE_NAMES = ['productionReports', 'anomalies', 'actions', 'aiMessages', 'settings', 'users', 'meta'] as const

type StoreName = (typeof STORE_NAMES)[number]
type DataSnapshot = { productionReports: DailyReport[]; anomalies: Anomaly[]; actions: Action[]; aiMessages: ChatMessage[]; settings: AppSettings; users: AppUser[] }
type NewRecord<T> = Omit<T, keyof AuditFields>
type MetaRecord = { id: 'meta'; schemaVersion: number; seededAt: string }
export type ReferenceDataMutation = { kind: ReferenceDataKind; mode: 'create' | 'edit'; value: string; previousValue?: string; defaultCtSeconds?: number }
export type ReferenceDataMutationResult = { snapshot: DataSnapshot; value: string; defaultCtSeconds?: number }

const now = () => new Date().toISOString()
const reportSlot = (report: Pick<DailyReport, 'date' | 'line' | 'shift'>) => `${report.date}|${report.line}|${report.shift ?? ''}`
const assertUniqueReportSlot = (report: DailyReport, reports: DailyReport[]) => {
  const conflict = reports.find((candidate) => candidate.id !== report.id && reportSlot(candidate) === reportSlot(report))
  if (conflict) throw new Error(`${report.date} · ${report.line} · ${report.shift ?? '未设置班次'} 已存在日报；多型号请在同一张日报中维护产品明细。`)
}
const normalizeText = (value: string, label: string) => { const trimmed = value.trim(); if (!trimmed) throw new Error(`${label}不能为空。`); return trimmed }
const sameText = (left: string, right: string) => left.localeCompare(right, 'zh-CN', { sensitivity: 'accent' }) === 0
const unique = (items: string[]) => items.filter((item, index, values) => item && values.findIndex((value) => sameText(value, item)) === index)
const emptySeedReferenceValues = (): SeedReferenceValues => ({ lines: [], productModels: [], departments: [], stations: [], anomalyTypeIds: [] })
const cloneSeedReferenceValues = (value?: Partial<SeedReferenceValues>): SeedReferenceValues => ({ lines: [...(value?.lines ?? [])], productModels: [...(value?.productModels ?? [])], departments: [...(value?.departments ?? [])], stations: [...(value?.stations ?? [])], anomalyTypeIds: [...(value?.anomalyTypeIds ?? [])] })
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error('IndexedDB 操作失败')) })
const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 写入失败')); transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 写入已取消')) })

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const openRequest = indexedDB.open(DB_NAME, DB_VERSION)
    openRequest.onupgradeneeded = () => { const database = openRequest.result; STORE_NAMES.forEach((storeName) => { if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'id' }) }) }
    openRequest.onsuccess = () => resolve(openRequest.result)
    openRequest.onerror = () => reject(openRequest.error ?? new Error('无法打开本地数据仓库'))
  })
}

async function readAll<T>(database: IDBDatabase, storeName: StoreName) { const transaction = database.transaction(storeName, 'readonly'); return request(transaction.objectStore(storeName).getAll() as IDBRequest<T[]>) }
async function readOne<T>(database: IDBDatabase, storeName: StoreName, id: IDBValidKey) { const transaction = database.transaction(storeName, 'readonly'); return request(transaction.objectStore(storeName).get(id) as IDBRequest<T | undefined>) }
async function putOne<T>(database: IDBDatabase, storeName: StoreName, value: T) { const transaction = database.transaction(storeName, 'readwrite'); transaction.objectStore(storeName).put(value); await transactionDone(transaction) }
async function deleteOne(database: IDBDatabase, storeName: StoreName, id: string) { const transaction = database.transaction(storeName, 'readwrite'); transaction.objectStore(storeName).delete(id); await transactionDone(transaction) }

function withSeedAudit<T extends { id: string }>(record: T, createdAt = now()): T & AuditFields { return { ...record, createdAt, updatedAt: createdAt, createdBy: CURRENT_USER, updatedBy: CURRENT_USER, dataSource: 'seed', version: 1 } }
function normalizeAudit<T extends { id: string }>(record: T, createdAt: string): T & AuditFields {
  const candidate = record as T & Partial<AuditFields>
  return { ...record, createdAt: candidate.createdAt ?? createdAt, updatedAt: candidate.updatedAt ?? candidate.createdAt ?? createdAt, createdBy: candidate.createdBy ?? CURRENT_USER, updatedBy: candidate.updatedBy ?? candidate.createdBy ?? CURRENT_USER, dataSource: candidate.dataSource ?? 'seed', version: candidate.version ?? 1 }
}
const touch = <T extends AuditFields>(record: T, patch: Partial<T>, timestamp = now()): T => ({ ...record, ...patch, updatedAt: timestamp, updatedBy: CURRENT_USER, version: record.version + 1 })

function createSettings(createdAt: string): AppSettings {
  return { ...withSeedAudit({ id: 'settings' }, createdAt), lines: [], productModels: [], departments: [], stations: [], defaultCtSeconds: {}, anomalyTypes: [], seedReferenceValues: emptySeedReferenceValues(), indicatorFormulaVersion: 'v2-calendar-shift' }
}
function createUsers(createdAt: string): AppUser[] { return [{ ...withSeedAudit({ id: 'local-user' }, createdAt), name: CURRENT_USER, department: '未配置', role: '本地操作用户' }] }

const modelsFor = (reports: DailyReport[]) => unique(reports.flatMap((report) => report.productDetails?.map((detail) => detail.productModel) ?? report.productModel.split(' / ')))
const defaultCtFor = (reports: DailyReport[], model: string) => {
  const detail = reports.flatMap((report) => report.productDetails ?? []).find((item) => item.productModel === model)
  if (detail) return detail.lineCt * 3600
  const report = reports.find((item) => item.productModel === model)
  return report ? report.lineCt * 3600 : 0
}

function normalizeSettings(raw: AppSettings | undefined, reports: DailyReport[], anomalies: Anomaly[], timestamp: string): AppSettings {
  const base = raw ? normalizeAudit(raw, timestamp) : createSettings(timestamp)
  const legacy = Boolean(raw && !Array.isArray((raw as Partial<AppSettings>).anomalyTypes))
  const lines = unique([...(base.lines ?? []), ...reports.map((report) => report.line)])
  const productModels = unique([...(base.productModels ?? []), ...modelsFor(reports)])
  const departments = unique([...(base.departments ?? []), ...anomalies.map((anomaly) => anomaly.department)])
  const stations = unique([...(base.stations ?? []), ...anomalies.map((anomaly) => anomaly.stationName ?? '')])
  const knownTypes = [...(base.anomalyTypes ?? []), ...(legacy ? DEMO_ANOMALY_TYPES : [])]
  const anomalyTypes = anomalies.reduce((items, anomaly) => items.some((item) => item.id === anomaly.type) ? items : [...items, { id: anomaly.type, name: anomaly.type, dataSource: anomaly.dataSource }], knownTypes.map((item) => ({ ...item, name: item.name.trim(), dataSource: item.dataSource ?? 'manual' })))
  const defaultCtSeconds = { ...(base.defaultCtSeconds ?? {}) }
  productModels.forEach((model) => { if (defaultCtSeconds[model] === undefined) defaultCtSeconds[model] = DEMO_DEFAULT_CT_SECONDS[model] ?? defaultCtFor(reports, model) })
  const seedReferenceValues = cloneSeedReferenceValues(base.seedReferenceValues)
  if (legacy) {
    seedReferenceValues.lines = unique([...seedReferenceValues.lines, ...lines.filter((line) => LINES.some((seed) => sameText(seed, line)))])
    seedReferenceValues.productModels = unique([...seedReferenceValues.productModels, ...productModels.filter((model) => PRODUCT_MODELS.some((seed) => sameText(seed, model)))])
    seedReferenceValues.departments = unique([...seedReferenceValues.departments, ...departments.filter((department) => DEPARTMENTS.some((seed) => sameText(seed, department)))])
    seedReferenceValues.stations = unique([...seedReferenceValues.stations, ...stations.filter((station) => DEMO_STATIONS.some((seed) => sameText(seed, station)))])
    seedReferenceValues.anomalyTypeIds = unique([...seedReferenceValues.anomalyTypeIds, ...DEMO_ANOMALY_TYPES.map((item) => item.id)])
  }
  return { ...base, lines, productModels, departments, stations, defaultCtSeconds, anomalyTypes, seedReferenceValues, indicatorFormulaVersion: 'v2-calendar-shift' }
}

async function initializeDatabase(database: IDBDatabase): Promise<DataSnapshot> {
  const initializedAt = now(); const productionReports: DailyReport[] = []; const anomalies: Anomaly[] = []; const actions: Action[] = []; const aiMessages: ChatMessage[] = []; const settings = createSettings(initializedAt); const users = createUsers(initializedAt)
  const transaction = database.transaction(STORE_NAMES, 'readwrite'); transaction.objectStore('settings').put(settings); users.forEach((user) => transaction.objectStore('users').put(user)); transaction.objectStore('meta').put({ id: 'meta', schemaVersion: SCHEMA_VERSION, seededAt: initializedAt } satisfies MetaRecord); await transactionDone(transaction)
  return { productionReports, anomalies, actions, aiMessages, settings, users }
}

function mergeDemoSettings(settings: AppSettings) {
  const seedReferenceValues = cloneSeedReferenceValues(settings.seedReferenceValues)
  const mergeValues = (current: string[], demo: string[], target: keyof Pick<SeedReferenceValues, 'lines' | 'productModels' | 'departments' | 'stations'>) => { const added = demo.filter((value) => !current.some((item) => sameText(item, value))); seedReferenceValues[target] = unique([...seedReferenceValues[target], ...added]); return [...current, ...added] }
  const lines = mergeValues(settings.lines, LINES, 'lines'); const productModels = mergeValues(settings.productModels, PRODUCT_MODELS, 'productModels'); const departments = mergeValues(settings.departments, DEPARTMENTS, 'departments'); const stations = mergeValues(settings.stations, DEMO_STATIONS, 'stations')
  const addedTypes = DEMO_ANOMALY_TYPES.filter((type) => !settings.anomalyTypes.some((item) => item.id === type.id)); seedReferenceValues.anomalyTypeIds = unique([...seedReferenceValues.anomalyTypeIds, ...addedTypes.map((item) => item.id)])
  return touch(settings, { lines, productModels, departments, stations, defaultCtSeconds: { ...DEMO_DEFAULT_CT_SECONDS, ...settings.defaultCtSeconds }, anomalyTypes: [...settings.anomalyTypes, ...addedTypes], seedReferenceValues })
}

async function loadDemoData(database: IDBDatabase): Promise<DataSnapshot> {
  const snapshot = await loadSnapshot(database); const createdAt = now(); const occupiedSlots = new Set(snapshot.productionReports.map(reportSlot)); const existingAnomalyIds = new Set(snapshot.anomalies.map((anomaly) => anomaly.id))
  const demoReports = mockDailyReports.filter((report) => !occupiedSlots.has(reportSlot(report))).map((report) => withSeedAudit(report, createdAt)); const demoAnomalies = mockAnomalies.filter((anomaly) => !existingAnomalyIds.has(anomaly.id)).map((anomaly) => withSeedAudit(anomaly, createdAt)); const settings = mergeDemoSettings(snapshot.settings)
  const transaction = database.transaction(['productionReports', 'anomalies', 'settings'], 'readwrite'); demoReports.forEach((report) => transaction.objectStore('productionReports').put(report)); demoAnomalies.forEach((anomaly) => transaction.objectStore('anomalies').put(anomaly)); transaction.objectStore('settings').put(settings); await transactionDone(transaction)
  return loadSnapshot(database)
}

async function clearDemoData(database: IDBDatabase): Promise<DataSnapshot> {
  const snapshot = await loadSnapshot(database); const manualReports = snapshot.productionReports.filter((report) => report.dataSource !== 'seed'); const manualAnomalies = snapshot.anomalies.filter((anomaly) => anomaly.dataSource !== 'seed')
  const referencedLines = new Set([...manualReports.map((report) => report.line), ...manualAnomalies.map((anomaly) => anomaly.line)]); const referencedModels = new Set(modelsFor(manualReports)); const referencedDepartments = new Set(manualAnomalies.map((anomaly) => anomaly.department)); const referencedStations = new Set(manualAnomalies.map((anomaly) => anomaly.stationName ?? '')); const referencedTypeIds = new Set(manualAnomalies.map((anomaly) => anomaly.type)); const seedReferenceValues = cloneSeedReferenceValues(snapshot.settings.seedReferenceValues)
  const keepValues = (values: string[], seeds: string[], referenced: Set<string>) => values.filter((value) => !seeds.includes(value) || referenced.has(value))
  const lines = keepValues(snapshot.settings.lines, seedReferenceValues.lines, referencedLines); const productModels = keepValues(snapshot.settings.productModels, seedReferenceValues.productModels, referencedModels); const departments = keepValues(snapshot.settings.departments, seedReferenceValues.departments, referencedDepartments); const stations = keepValues(snapshot.settings.stations, seedReferenceValues.stations, referencedStations); const anomalyTypes = snapshot.settings.anomalyTypes.filter((type) => !seedReferenceValues.anomalyTypeIds.includes(type.id) || referencedTypeIds.has(type.id))
  const settings = touch(snapshot.settings, { lines, productModels, departments, stations, anomalyTypes, defaultCtSeconds: Object.fromEntries(Object.entries(snapshot.settings.defaultCtSeconds).filter(([model]) => productModels.includes(model))), seedReferenceValues: emptySeedReferenceValues() })
  const stores = ['productionReports', 'anomalies', 'actions', 'aiMessages', 'settings'] as const; const transaction = database.transaction(stores, 'readwrite'); snapshot.productionReports.filter((report) => report.dataSource === 'seed').forEach((report) => transaction.objectStore('productionReports').delete(report.id)); snapshot.anomalies.filter((anomaly) => anomaly.dataSource === 'seed').forEach((anomaly) => transaction.objectStore('anomalies').delete(anomaly.id)); snapshot.actions.filter((action) => action.dataSource === 'seed').forEach((action) => transaction.objectStore('actions').delete(action.id)); snapshot.aiMessages.filter((message) => message.dataContext === 'seed').forEach((message) => transaction.objectStore('aiMessages').delete(message.id)); transaction.objectStore('settings').put(settings); await transactionDone(transaction)
  return loadSnapshot(database)
}

async function loadSnapshot(database: IDBDatabase): Promise<DataSnapshot> {
  const meta = await readOne<MetaRecord>(database, 'meta', 'meta'); if (!meta) return initializeDatabase(database)
  const [rawReports, rawAnomalies, actions, rawAiMessages, rawSettings, users] = await Promise.all([readAll<DailyReport>(database, 'productionReports'), readAll<Anomaly>(database, 'anomalies'), readAll<Action>(database, 'actions'), readAll<ChatMessage>(database, 'aiMessages'), readOne<AppSettings>(database, 'settings', 'settings'), readAll<AppUser>(database, 'users')])
  const migratedAt = now(); const productionReports = rawReports.map((report) => normalizeAudit(report, migratedAt)); const anomalies = rawAnomalies.map((anomaly) => normalizeAudit(anomaly, migratedAt)); const aiMessages = normalizeAiMessages(rawAiMessages); const settings = normalizeSettings(rawSettings, productionReports, anomalies, migratedAt); const normalizedUsers = users.map((user) => normalizeAudit(user, migratedAt))
  const settingsChanged = JSON.stringify(rawSettings) !== JSON.stringify(settings); const aiMessagesChanged = JSON.stringify(rawAiMessages) !== JSON.stringify(aiMessages); const needsMigration = meta.schemaVersion < SCHEMA_VERSION || settingsChanged || aiMessagesChanged || normalizedUsers.some((user, index) => JSON.stringify(user) !== JSON.stringify(users[index]))
  if (needsMigration) { const transaction = database.transaction(['productionReports', 'anomalies', 'aiMessages', 'settings', 'users', 'meta'], 'readwrite'); productionReports.forEach((report) => transaction.objectStore('productionReports').put(report)); anomalies.forEach((anomaly) => transaction.objectStore('anomalies').put(anomaly)); aiMessages.forEach((message) => transaction.objectStore('aiMessages').put(message)); transaction.objectStore('settings').put(settings); normalizedUsers.forEach((user) => transaction.objectStore('users').put(user)); transaction.objectStore('meta').put({ ...meta, schemaVersion: SCHEMA_VERSION }); await transactionDone(transaction) }
  return { productionReports, anomalies, actions, aiMessages, settings, users: normalizedUsers }
}

async function clearAiMessages(database: IDBDatabase) { const transaction = database.transaction('aiMessages', 'readwrite'); transaction.objectStore('aiMessages').clear(); await transactionDone(transaction) }

function referenceValues(settings: AppSettings, kind: ReferenceDataKind) { return kind === 'line' ? settings.lines : kind === 'productModel' ? settings.productModels : kind === 'station' ? settings.stations : kind === 'department' ? settings.departments : settings.anomalyTypes.map((type) => type.name) }
function referenceValueId() { const random = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID().slice(0, 8) : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; return `custom-${random}` }

async function saveReferenceData(database: IDBDatabase, input: ReferenceDataMutation): Promise<ReferenceDataMutationResult> {
  const snapshot = await loadSnapshot(database); const label = input.kind === 'line' ? '产线名称' : input.kind === 'productModel' ? '产品型号名称' : input.kind === 'station' ? '工位名称' : input.kind === 'department' ? '责任部门名称' : '异常类型名称'; const value = normalizeText(input.value, label); const previousValue = input.previousValue?.trim()
  if (input.mode === 'edit' && !previousValue) throw new Error(`请先选择需要编辑的${label}。`)
  const values = referenceValues(snapshot.settings, input.kind)
  const isSameValue = input.mode === 'edit' && (input.kind === 'anomalyType'
    ? sameText(value, snapshot.settings.anomalyTypes.find((type) => type.id === previousValue)?.name ?? '')
    : sameText(value, previousValue ?? ''))
  const hasDuplicate = input.kind === 'anomalyType'
    ? snapshot.settings.anomalyTypes.some((type) => sameText(type.name, value) && type.id !== previousValue)
    : values.some((item) => sameText(item, value) && !isSameValue)
  if (hasDuplicate) throw new Error(`${label}“${value}”已存在。`)
  if (input.kind === 'productModel' && (!Number.isFinite(input.defaultCtSeconds) || (input.defaultCtSeconds ?? 0) <= 0)) throw new Error('产品型号的默认 CT 必须大于 0 秒。')
  const timestamp = now(); let settings = snapshot.settings; let reports = snapshot.productionReports; let anomalies = snapshot.anomalies; const seedReferenceValues = cloneSeedReferenceValues(settings.seedReferenceValues)
  const replaceArrayValue = (items: string[]) => input.mode === 'create' ? [...items, value] : items.map((item) => sameText(item, previousValue ?? '') ? value : item)
  const removeRenamedSeed = (key: keyof Pick<SeedReferenceValues, 'lines' | 'productModels' | 'departments' | 'stations'>) => { if (previousValue && seedReferenceValues[key].some((item) => sameText(item, previousValue))) seedReferenceValues[key] = seedReferenceValues[key].filter((item) => !sameText(item, previousValue)) }
  if (input.kind === 'line') { const lines = replaceArrayValue(settings.lines); if (input.mode === 'edit') { reports = reports.map((report) => sameText(report.line, previousValue!) ? touch(report, { line: value }, timestamp) : report); anomalies = anomalies.map((anomaly) => sameText(anomaly.line, previousValue!) ? touch(anomaly, { line: value }, timestamp) : anomaly); removeRenamedSeed('lines') }; settings = touch(settings, { lines, seedReferenceValues }, timestamp) }
  else if (input.kind === 'productModel') { const productModels = replaceArrayValue(settings.productModels); const defaultCtSeconds = { ...settings.defaultCtSeconds }; if (input.mode === 'edit') delete defaultCtSeconds[previousValue!]; defaultCtSeconds[value] = input.defaultCtSeconds!; if (input.mode === 'edit') { reports = reports.map((report) => { const productDetails = report.productDetails?.map((detail) => sameText(detail.productModel, previousValue!) ? { ...detail, productModel: value } : detail); const productModel = productDetails?.map((detail) => detail.productModel).join(' / ') ?? (sameText(report.productModel, previousValue!) ? value : report.productModel); return productModel !== report.productModel || JSON.stringify(productDetails) !== JSON.stringify(report.productDetails) ? touch(report, { productModel, productDetails }, timestamp) : report }); removeRenamedSeed('productModels') }; settings = touch(settings, { productModels, defaultCtSeconds, seedReferenceValues }, timestamp) }
  else if (input.kind === 'station') { const stations = replaceArrayValue(settings.stations); if (input.mode === 'edit') { anomalies = anomalies.map((anomaly) => sameText(anomaly.stationName ?? '', previousValue!) ? touch(anomaly, { stationName: value }, timestamp) : anomaly); removeRenamedSeed('stations') }; settings = touch(settings, { stations, seedReferenceValues }, timestamp) }
  else if (input.kind === 'department') { const departments = replaceArrayValue(settings.departments); if (input.mode === 'edit') { anomalies = anomalies.map((anomaly) => sameText(anomaly.department, previousValue!) ? touch(anomaly, { department: value }, timestamp) : anomaly); removeRenamedSeed('departments') }; settings = touch(settings, { departments, seedReferenceValues }, timestamp) }
  else if (input.mode === 'create') { const id = referenceValueId(); settings = touch(settings, { anomalyTypes: [...settings.anomalyTypes, { id, name: value, dataSource: 'manual' }] }, timestamp); const transaction = database.transaction('settings', 'readwrite'); transaction.objectStore('settings').put(settings); await transactionDone(transaction); return { snapshot: await loadSnapshot(database), value: id } }
  else { const anomalyType = settings.anomalyTypes.find((type) => type.id === previousValue); if (!anomalyType) throw new Error('未找到需要编辑的异常类型。'); seedReferenceValues.anomalyTypeIds = seedReferenceValues.anomalyTypeIds.filter((id) => id !== anomalyType.id); settings = touch(settings, { anomalyTypes: settings.anomalyTypes.map((type) => type.id === anomalyType.id ? { ...type, name: value, dataSource: 'manual' } : type), seedReferenceValues }, timestamp) }
  const transaction = database.transaction(['productionReports', 'anomalies', 'settings'], 'readwrite'); reports.forEach((report) => transaction.objectStore('productionReports').put(report)); anomalies.forEach((anomaly) => transaction.objectStore('anomalies').put(anomaly)); transaction.objectStore('settings').put(settings); await transactionDone(transaction)
  return { snapshot: await loadSnapshot(database), value, defaultCtSeconds: input.kind === 'productModel' ? input.defaultCtSeconds : undefined }
}

// ponytail: browser-local repository; replace these methods with HTTP calls when multi-user synchronization is required.
export const repository = { load: async () => loadSnapshot(await openDatabase()), loadDemoData: async () => loadDemoData(await openDatabase()), clearDemoData: async () => clearDemoData(await openDatabase()), clearAiMessages: async () => clearAiMessages(await openDatabase()), saveReferenceData: async (input: ReferenceDataMutation) => saveReferenceData(await openDatabase(), input), saveProductionReport: async (report: DailyReport) => { const database = await openDatabase(); assertUniqueReportSlot(report, await readAll<DailyReport>(database, 'productionReports')); await putOne(database, 'productionReports', report) }, deleteProductionReport: async (id: string) => deleteOne(await openDatabase(), 'productionReports', id), saveAnomaly: async (anomaly: Anomaly) => putOne(await openDatabase(), 'anomalies', anomaly), deleteAnomaly: async (id: string) => deleteOne(await openDatabase(), 'anomalies', id), saveAction: async (action: Action) => putOne(await openDatabase(), 'actions', action), deleteAction: async (id: string) => deleteOne(await openDatabase(), 'actions', id), saveAiMessage: async (message: ChatMessage) => putOne(await openDatabase(), 'aiMessages', message), saveSettings: async (settings: AppSettings) => putOne(await openDatabase(), 'settings', settings), saveUser: async (user: AppUser) => putOne(await openDatabase(), 'users', user), deleteUser: async (id: string) => deleteOne(await openDatabase(), 'users', id) }
export type { DataSnapshot, NewRecord }
