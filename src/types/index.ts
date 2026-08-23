export type DataSource = 'seed' | 'manual'

export interface AuditFields {
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  dataSource: DataSource
  version: number
}

export interface ProductDetail {
  productModel: string
  plannedQty: number
  actualQty: number
  defectQty: number
  lineCt: number
}

export interface DailyReport extends AuditFields {
  id: string
  date: string
  shift?: '白班' | '夜班'
   line: string
   productModel: string
   plannedQty: number
   actualQty: number
   productionTime: number
   downtime: number
  operators: number
  staffing?: number
   defectQty: number
   lineCt: number
   shiftHours: number
   mealBreakHours: number
   restBreakHours: number
   productDetails?: ProductDetail[]
 }

export interface ComputedReport extends DailyReport {
   goodQty: number
   achievementRate: number
   yieldRate: number
   ct: number
   availability: number
   oee: number
   upph: number
   perCapitaEfficiency: number
   anomalyDowntimeHours: number
   totalDowntimeHours: number
   standardEarnedLaborHours: number
   laborEfficiency: number
 }

export type BuiltInAnomalyType =
  | 'equipment'
  | 'incomingQuality'
  | 'processQuality'
  | 'processEngineering'
  | 'materialShortage'
  | 'lineSetup'
  | 'changeover'
  | 'personnel'
  | 'other'
export type AnomalyType = BuiltInAnomalyType | (string & {})
 export type AnomalyImpactType = 'stop' | 'nonstop'

 export interface Anomaly extends AuditFields {
   id: string
   type: AnomalyType
   line: string
   startTime: string
   endTime?: string
   shift?: '白班' | '夜班'
   stationName?: string
   impactType?: AnomalyImpactType
   impactMinutes: number
   department: string
   description: string
   action: string
   status: 'pending' | 'processing' | 'closed'
 }

export interface Action extends AuditFields {
  id: string
  title: string
  status: 'pending' | 'processing' | 'closed'
  sourceType?: 'report' | 'anomaly' | 'ai'
  sourceId?: string
  ownerId?: string
  ownerName?: string
  dueAt?: string
}

export interface AppUser extends AuditFields {
  id: string
  name: string
  department: string
  role: string
}

export interface AppSettings extends AuditFields {
  id: 'settings'
  lines: string[]
  productModels: string[]
  departments: string[]
  stations: string[]
  defaultCtSeconds: Record<string, number>
  anomalyTypes: AnomalyTypeDefinition[]
  seedReferenceValues: SeedReferenceValues
  indicatorFormulaVersion: string
}

export interface AnomalyTypeDefinition {
  id: string
  name: string
  dataSource: DataSource
}

export interface SeedReferenceValues {
  lines: string[]
  productModels: string[]
  departments: string[]
  stations: string[]
  anomalyTypeIds: string[]
}

export interface KpiAggregate {
  plannedQty: number
  actualQty: number
  goodQty: number
  defectQty: number
  achievementRate: number
  oee: number
  upph: number
  yieldRate: number
  downtimeHours: number
  downtimeRatio: number
  plannedDowntimeHours: number
  anomalyDowntimeHours: number
  actualLaborHours: number
  theoreticalLaborHours: number
  standardEarnedLaborHours: number
  laborEfficiency: number
  laborGap: number
  weightedCt: number
}

 export interface KpiSummary {
   date: string
   line: string
   productModel: string
   plannedQty: number
   actualQty: number
   goodQty: number
   achievementRate: number
   yieldRate: number
   oee: number
   ct: number
   availability: number
   upph: number
   perCapitaEfficiency: number
 }

export type EvidenceSourceType = 'productionReport' | 'anomaly' | 'action' | 'metric'

export interface EvidenceRef {
  id: string
  sourceType: EvidenceSourceType
  sourceId: string
  title: string
  date?: string
  line?: string
  shift?: '白班' | '夜班'
  station?: string
  metricName?: string
  metricValue?: string
  unit?: string
  dataSource: DataSource
  updatedAt: string
  formulaVersion?: string
  link: string
}

export type ChatDataContext = 'seed' | 'manual' | 'mixed' | 'empty' | 'unknown'

export interface ChatMessage extends AuditFields {
  id: string
  role: 'user' | 'assistant'
  content: string
  conversationId?: string
  dataContext?: ChatDataContext
  evidenceRefs?: EvidenceRef[]
  isSuggestion?: boolean
  defaultRange?: string
}
