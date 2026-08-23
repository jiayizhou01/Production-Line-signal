import { useEffect, useSyncExternalStore } from 'react'
import { repository, type ReferenceDataMutation } from '../data/repository'
import type { Action, Anomaly, AppSettings, AppUser, AuditFields, ChatMessage, DailyReport } from '../types'

type NewRecord<T> = Omit<T, keyof AuditFields>
type UpdateRecord<T> = Partial<NewRecord<T>>

export type AppDataState = {
  loading: boolean
  error: string | null
  productionReports: DailyReport[]
  anomalies: Anomaly[]
  actions: Action[]
  aiMessages: ChatMessage[]
  settings: AppSettings | null
  users: AppUser[]
}

const currentUser = '本地用户'
const emptyState: AppDataState = { loading: true, error: null, productionReports: [], anomalies: [], actions: [], aiMessages: [], settings: null, users: [] }
let state = emptyState
let initialization: Promise<void> | null = null
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())
const setState = (next: AppDataState) => { state = next; notify() }
const auditNew = <T extends { id: string }>(record: NewRecord<T>): T => {
  const timestamp = new Date().toISOString()
  return { ...record, createdAt: timestamp, updatedAt: timestamp, createdBy: currentUser, updatedBy: currentUser, dataSource: 'manual', version: 1 } as unknown as T
}
const auditUpdate = <T extends AuditFields>(record: T, patch: UpdateRecord<T>): T => ({
  ...record,
  ...patch,
  updatedAt: new Date().toISOString(),
  updatedBy: currentUser,
  version: record.version + 1
})

async function runWrite<T>(operation: () => Promise<T>) {
  try {
    const result = await operation()
    if (state.error) setState({ ...state, error: null })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : '数据保存失败，请重试。'
    setState({ ...state, error: message })
    throw error
  }
}

export const appStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
  getSnapshot: () => state,
  async initialize() {
    if (initialization) return initialization
    initialization = repository.load()
      .then((snapshot) => setState({ loading: false, error: null, ...snapshot }))
      .catch((error) => setState({ ...emptyState, loading: false, error: error instanceof Error ? error.message : '无法加载本地数据' }))
    return initialization
  },
  async loadDemoData() {
    await runWrite(async () => {
      const snapshot = await repository.loadDemoData()
      setState({ loading: false, error: null, ...snapshot })
    })
  },
  async clearDemoData() {
    await runWrite(async () => {
      const snapshot = await repository.clearDemoData()
      setState({ loading: false, error: null, ...snapshot })
    })
  },
  async saveReferenceData(input: ReferenceDataMutation) {
    return runWrite(async () => {
      const result = await repository.saveReferenceData(input)
      setState({ loading: false, error: null, ...result.snapshot })
      return result
    })
  },
  async createProductionReport(report: NewRecord<DailyReport>) {
    const saved = auditNew<DailyReport>(report)
    await runWrite(async () => { await repository.saveProductionReport(saved); setState({ ...state, productionReports: [saved, ...state.productionReports] }) })
  },
  async updateProductionReport(id: string, patch: UpdateRecord<DailyReport>) {
    const current = state.productionReports.find((report) => report.id === id)
    if (!current) throw new Error('未找到需要修改的生产日报')
    const saved = auditUpdate(current, patch)
    await runWrite(async () => { await repository.saveProductionReport(saved); setState({ ...state, productionReports: state.productionReports.map((report) => report.id === id ? saved : report) }) })
  },
  async deleteProductionReport(id: string) {
    await runWrite(async () => { await repository.deleteProductionReport(id); setState({ ...state, productionReports: state.productionReports.filter((report) => report.id !== id) }) })
  },
  async createAnomaly(anomaly: NewRecord<Anomaly>) {
    const saved = auditNew<Anomaly>(anomaly)
    await runWrite(async () => { await repository.saveAnomaly(saved); setState({ ...state, anomalies: [saved, ...state.anomalies] }) })
  },
  async updateAnomaly(id: string, patch: UpdateRecord<Anomaly>) {
    const current = state.anomalies.find((anomaly) => anomaly.id === id)
    if (!current) throw new Error('未找到需要修改的异常记录')
    const saved = auditUpdate(current, patch)
    await runWrite(async () => { await repository.saveAnomaly(saved); setState({ ...state, anomalies: state.anomalies.map((anomaly) => anomaly.id === id ? saved : anomaly) }) })
  },
  async deleteAnomaly(id: string) {
    await runWrite(async () => { await repository.deleteAnomaly(id); setState({ ...state, anomalies: state.anomalies.filter((anomaly) => anomaly.id !== id) }) })
  },
  async createAction(action: NewRecord<Action>) {
    const saved = auditNew<Action>(action)
    await runWrite(async () => { await repository.saveAction(saved); setState({ ...state, actions: [saved, ...state.actions] }) })
  },
  async updateAction(id: string, patch: UpdateRecord<Action>) {
    const current = state.actions.find((action) => action.id === id)
    if (!current) throw new Error('未找到需要修改的责任行动')
    const saved = auditUpdate(current, patch)
    await runWrite(async () => { await repository.saveAction(saved); setState({ ...state, actions: state.actions.map((action) => action.id === id ? saved : action) }) })
  },
  async deleteAction(id: string) {
    await runWrite(async () => { await repository.deleteAction(id); setState({ ...state, actions: state.actions.filter((action) => action.id !== id) }) })
  },
  async createAiMessage(message: NewRecord<ChatMessage>) {
    const saved = auditNew<ChatMessage>(message)
    await runWrite(async () => { await repository.saveAiMessage(saved); setState({ ...state, aiMessages: [...state.aiMessages, saved] }) })
  },
  async clearAiMessages() {
    await runWrite(async () => { await repository.clearAiMessages(); setState({ ...state, aiMessages: [] }) })
  },
  async updateSettings(patch: UpdateRecord<AppSettings>) {
    if (!state.settings) throw new Error('系统设置尚未加载完成')
    const saved = auditUpdate(state.settings, patch)
    await runWrite(async () => { await repository.saveSettings(saved); setState({ ...state, settings: saved }) })
  },
  async saveUser(user: NewRecord<AppUser>) {
    const existing = state.users.find((item) => item.id === user.id)
    const saved = existing ? auditUpdate(existing, user) : auditNew<AppUser>(user)
    await runWrite(async () => { await repository.saveUser(saved); setState({ ...state, users: existing ? state.users.map((item) => item.id === saved.id ? saved : item) : [...state.users, saved] }) })
  },
  async deleteUser(id: string) {
    await runWrite(async () => { await repository.deleteUser(id); setState({ ...state, users: state.users.filter((user) => user.id !== id) }) })
  }
}

export function useAppData() {
  const snapshot = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot)
  useEffect(() => { void appStore.initialize() }, [])
  return snapshot
}
