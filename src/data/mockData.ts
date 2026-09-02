import type { Anomaly, AnomalyTypeDefinition, AuditFields, DailyReport, ProductDetail } from '../types'

type DailyReportSeed = Omit<DailyReport, keyof AuditFields>
type AnomalySeed = Omit<Anomaly, keyof AuditFields>

export const LINES = ['Line-A', 'Line-B', 'Line-C']
export const PRODUCT_MODELS = ['Model-X100', 'Model-X200', 'Model-Y300']
export const DEPARTMENTS = ['设备维护', '生产管理', '质量管理', '工艺工程', '物料管理', '人力资源']
export const DEMO_STATIONS = Array.from({ length: 20 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`)
export const DEMO_DEFAULT_CT_SECONDS: Record<string, number> = { 'Model-X100': 28.8, 'Model-X200': 27, 'Model-Y300': 32.4 }

const START_DATE = '2026-06-10'
const END_DATE = '2026-08-10'
const modelCt: Record<string, number> = { 'Model-X100': 28.8 / 3600, 'Model-X200': 27 / 3600, 'Model-Y300': 32.4 / 3600 }
const anomalyTypes = ['equipment', 'incomingQuality', 'processQuality', 'processEngineering', 'materialShortage', 'lineSetup', 'changeover', 'personnel', 'other'] as const
const anomalyLabels: Record<string, string> = {
  equipment: '设备异常', incomingQuality: '来料质量', processQuality: '制程质量', processEngineering: '制程工艺', materialShortage: '物料差缺', lineSetup: '清线铺线', changeover: '换型问题', personnel: '人员异常', other: '其他异常'
}
const typeDepartments: Record<string, string> = {
  equipment: '设备维护', incomingQuality: '质量管理', processQuality: '质量管理', processEngineering: '工艺工程', materialShortage: '物料管理', lineSetup: '生产管理', changeover: '生产管理', personnel: '人力资源', other: '生产管理'
}

export const DEMO_ANOMALY_TYPES: AnomalyTypeDefinition[] = anomalyTypes.map((id) => ({ id, name: anomalyLabels[id], dataSource: 'seed' }))

const formatDate = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000)
const datesBetween = () => {
  const start = new Date(`${START_DATE}T00:00:00Z`)
  const end = new Date(`${END_DATE}T00:00:00Z`)
  const dates: Date[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date)
  return dates
}

function createProductDetails(dayIndex: number, lineIndex: number, shiftIndex: number, availableHours: number): ProductDetail[] {
  const primaryIndex = (dayIndex + lineIndex + shiftIndex) % PRODUCT_MODELS.length
  const hasSecondModel = (dayIndex + lineIndex * 2 + shiftIndex) % 5 === 0
  const indexes = hasSecondModel ? [primaryIndex, (primaryIndex + 1) % PRODUCT_MODELS.length] : [primaryIndex]
  return indexes.map((modelIndex, detailIndex) => {
    const productModel = PRODUCT_MODELS[modelIndex]
    const share = indexes.length === 1 ? 1 : detailIndex === 0 ? 0.62 : 0.38
    const plannedQty = Math.floor(availableHours / modelCt[productModel] * share * 0.92)
    const performance = 0.89 + ((dayIndex * 7 + lineIndex * 11 + shiftIndex * 5 + detailIndex * 3) % 15) / 100
    const actualQty = Math.max(1, Math.floor(plannedQty * performance))
    const defectQty = Math.max(0, Math.floor(actualQty * (0.004 + ((dayIndex + detailIndex * 2 + lineIndex) % 12) / 1000)))
    return { productModel, plannedQty, actualQty, defectQty, lineCt: modelCt[productModel] }
  })
}

function generateDailyReports(): DailyReportSeed[] {
  const reports: DailyReportSeed[] = []
  datesBetween().forEach((date, dayIndex) => {
    LINES.forEach((line, lineIndex) => {
      ;(['白班', '夜班'] as const).forEach((shift, shiftIndex) => {
        const shiftHours = 10
        const mealBreakHours = 1
        const downtime = 0.15 + ((dayIndex * 3 + lineIndex * 7 + shiftIndex * 5) % 12) * 0.08 + ([12, 27, 44, 53].includes(dayIndex % 61) ? 0.65 : 0)
        const availableHours = shiftHours - mealBreakHours
        const productDetails = createProductDetails(dayIndex, lineIndex, shiftIndex, availableHours)
        const plannedQty = productDetails.reduce((sum, detail) => sum + detail.plannedQty, 0)
        const actualQty = productDetails.reduce((sum, detail) => sum + detail.actualQty, 0)
        const defectQty = productDetails.reduce((sum, detail) => sum + detail.defectQty, 0)
        const staffing = 9 + lineIndex + ((dayIndex + shiftIndex) % 3)
        const operators = staffing + (((dayIndex + lineIndex * 2 + shiftIndex) % 7 === 0) ? 2 : ((dayIndex + shiftIndex) % 5 === 0 ? 1 : 0))
        const primary = productDetails[0]
        const dateString = formatDate(date)
        reports.push({
          id: `DEMO-RPT-${dateString}-${line}-${shift}`,
          date: dateString,
          shift,
          line,
          productModel: primary.productModel,
          plannedQty,
          actualQty,
          productionTime: shiftHours,
          downtime: Number(downtime.toFixed(2)),
          operators,
          staffing,
          defectQty,
          lineCt: primary.lineCt,
          shiftHours,
          mealBreakHours,
          restBreakHours: 0,
          productDetails
        })
      })
    })
  })
  return reports
}

function generateAnomalies(): AnomalySeed[] {
  const anomalies: AnomalySeed[] = []
  datesBetween().forEach((date, dayIndex) => {
    const count = dayIndex % 4 === 0 ? 3 : 2
    for (let occurrence = 0; occurrence < count; occurrence += 1) {
      const lineIndex = (dayIndex + occurrence * 2) % LINES.length
      const type = occurrence === 0 && dayIndex % 6 === 0 ? 'equipment' : anomalyTypes[(dayIndex * 2 + occurrence * 3) % anomalyTypes.length]
      const shift = occurrence % 2 === 0 ? '白班' : '夜班'
      const hour = shift === '白班' ? 8 + ((dayIndex + occurrence * 3) % 10) : 20 + ((dayIndex + occurrence * 2) % 4)
      const minute = (dayIndex * 11 + occurrence * 17) % 60
      const impactType = (dayIndex + occurrence) % 9 === 0 ? 'nonstop' : 'stop'
      const impactMinutes = impactType === 'nonstop' ? 0 : 12 + ((dayIndex * 13 + occurrence * 19) % 78)
      const start = new Date(date.getTime() + (hour * 60 + minute) * 60000)
      const end = new Date(start.getTime() + impactMinutes * 60000)
      const dateString = formatDate(date)
      const recent = dayIndex >= 53
      const status: Anomaly['status'] = recent ? (occurrence === 0 ? 'pending' : 'processing') : (dayIndex + occurrence) % 3 === 0 ? 'processing' : 'closed'
      const stationName = occurrence === 0 && dayIndex % 6 === 0 ? `A${String(lineIndex + 3).padStart(2, '0')}` : `A${String((dayIndex * 3 + occurrence * 5 + lineIndex) % 20 + 1).padStart(2, '0')}`
      const timestamp = (value: Date) => `${formatDate(value)} ${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`
      anomalies.push({
        id: `ANM-DEMO-${dateString.replace(/-/g, '')}-${String(occurrence + 1).padStart(2, '0')}`,
        type,
        line: LINES[lineIndex],
        shift,
        stationName,
        impactType,
        impactMinutes,
        startTime: timestamp(start),
        endTime: timestamp(end),
        department: typeDepartments[type],
        description: `${anomalyLabels[type]}：${stationName} 工位发生模拟${impactType === 'stop' ? '停线' : '未停线'}异常，供功能验证使用。`,
        action: status === 'closed' ? '已完成初步处理并记录预防措施' : '正在排查根因并跟进改善。',
        status
      })
    }
  })
  return anomalies.sort((left, right) => right.startTime.localeCompare(left.startTime))
}

export const mockDailyReports = generateDailyReports()
export const mockAnomalies = generateAnomalies()
