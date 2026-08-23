import type { AnomalyType, AppSettings } from '../types'

export type ReferenceDataKind = 'line' | 'productModel' | 'station' | 'department' | 'anomalyType'

export const referenceDataLabels: Record<ReferenceDataKind, string> = {
  line: '产线',
  productModel: '产品型号',
  station: '工位名称',
  department: '责任部门',
  anomalyType: '异常类型'
}

const builtInTypeLabels: Record<string, string> = {
  equipment: '设备异常',
  incomingQuality: '来料质量',
  processQuality: '制程质量',
  processEngineering: '制程工艺',
  materialShortage: '物料差缺',
  lineSetup: '清线铺线',
  changeover: '换型问题',
  personnel: '人员异常',
  other: '其他异常'
}

const typeDepartments: Record<string, string> = {
  equipment: '设备维护',
  incomingQuality: '质量管理',
  processQuality: '质量管理',
  processEngineering: '工艺工程',
  materialShortage: '物料管理',
  lineSetup: '生产管理',
  changeover: '生产管理',
  personnel: '人力资源',
  other: '生产管理'
}

const typeColorClasses: Record<string, string> = {
  equipment: 'bg-red-50 text-red-600',
  incomingQuality: 'bg-amber-50 text-amber-600',
  processQuality: 'bg-slate-100 text-slate-700',
  processEngineering: 'bg-primary-50 text-primary-700',
  materialShortage: 'bg-amber-50 text-amber-600',
  lineSetup: 'bg-slate-100 text-slate-700',
  changeover: 'bg-primary-50 text-primary-700',
  personnel: 'bg-red-50 text-red-600',
  other: 'bg-slate-100 text-slate-700'
}

export const getAnomalyTypeName = (settings: Pick<AppSettings, 'anomalyTypes'> | null | undefined, type: AnomalyType) =>
  settings?.anomalyTypes.find((item) => item.id === type)?.name ?? builtInTypeLabels[type] ?? type

export const getAnomalyTypeColor = (type: AnomalyType) => typeColorClasses[type] ?? 'bg-slate-100 text-slate-700'

export const getDefaultDepartmentForAnomalyType = (type: AnomalyType) => typeDepartments[type] ?? ''

export const getBuiltInAnomalyTypeName = (type: string) => builtInTypeLabels[type] ?? type
