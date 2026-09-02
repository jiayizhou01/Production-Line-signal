import { useEffect, useMemo, useState } from 'react'
import { Download, Filter, Plus, Search, Trash2, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { computeAllReports, formatNumber, formatPercent, getReportTimeSummary, getStandardEarnedLaborHours } from '../services/kpiService'
import { appStore, useAppData } from '../store/appStore'
import type { AppSettings, ComputedReport, DailyReport } from '../types'
import { downloadCsv, type CsvColumn } from '../services/csvExport'
import { readNavigationContext } from '../services/navigationContext'
import ReferenceDataActions from '../components/ReferenceDataActions'
import { getPreviousLocalDate } from '../services/dateDefaults'

type ProductDetailForm = {
  id: string
  productModel: string
  plannedQty: number
  actualQty: number
  defectQty: number
  ctSeconds: number
}

type ReportForm = {
  date: string
  shift: '白班' | '夜班'
  line: string
  productDetails: ProductDetailForm[]
  shiftHours: number
  mealBreakHours: number
  downtime: number
  staffing: number
  operators: number
}

const createProductDetail = (settings: AppSettings, productModel = settings.productModels[0] ?? ''): ProductDetailForm => ({
  id: `${Date.now()}-${Math.random()}`,
  productModel,
  plannedQty: 0,
  actualQty: 0,
  defectQty: 0,
  ctSeconds: settings.defaultCtSeconds[productModel] ?? 0
})

const createInitialForm = (settings: AppSettings): ReportForm => ({
  date: getPreviousLocalDate(),
  shift: '白班',
  line: settings.lines[0] ?? '',
  productDetails: [createProductDetail(settings)],
  shiftHours: 0,
  mealBreakHours: 0,
  downtime: 0,
  staffing: 0,
  operators: 0
})

const createEditForm = (report: DailyReport): ReportForm => ({
  date: report.date,
  shift: report.shift ?? '白班',
  line: report.line,
  productDetails: (report.productDetails?.length ? report.productDetails : [{
    productModel: report.productModel,
    plannedQty: report.plannedQty,
    actualQty: report.actualQty,
    defectQty: report.defectQty,
    lineCt: report.lineCt
  }]).map((detail, index) => ({
    id: `editing-${report.id}-${index}`,
    productModel: detail.productModel,
    plannedQty: detail.plannedQty,
    actualQty: detail.actualQty,
    defectQty: detail.defectQty,
    ctSeconds: detail.lineCt * 3600
  })),
  shiftHours: report.shiftHours ?? report.productionTime,
  mealBreakHours: report.mealBreakHours ?? 0,
  downtime: report.downtime,
  staffing: report.staffing ?? 0,
  operators: report.operators
})

const exportNumber = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : ''
const exportPercent = (value: number) => `${(value * 100).toFixed(1)}%`
const productDetailsText = (report: ComputedReport) => (report.productDetails?.length ? report.productDetails : [{ productModel: report.productModel, plannedQty: report.plannedQty, actualQty: report.actualQty, defectQty: report.defectQty, lineCt: report.lineCt }])
  .map((detail) => `${detail.productModel}（计划 ${detail.plannedQty}，实际 ${detail.actualQty}，不良 ${detail.defectQty}，入库 ${Math.max(0, detail.actualQty - detail.defectQty)}，CT ${exportNumber(detail.lineCt * 3600)}s）`)
  .join('；')

const reportExportColumns: CsvColumn<ComputedReport>[] = [
  { header: '日期', value: (report) => report.date },
  { header: '班次', value: (report) => report.shift ?? '' },
  { header: '产线', value: (report) => report.line },
  { header: '产品型号', value: (report) => report.productModel },
  { header: 'CT（秒）', value: (report) => exportNumber(report.lineCt * 3600) },
  { header: 'OEE', value: (report) => exportPercent(report.oee) },
  { header: 'UPPH', value: (report) => exportNumber(report.upph) },
  { header: '计划达成率', value: (report) => exportPercent(report.achievementRate) },
  { header: '良率', value: (report) => exportPercent(report.yieldRate) },
  { header: '计划下线数', value: (report) => report.plannedQty },
  { header: '实际下线数', value: (report) => report.actualQty },
  { header: '实际入库数', value: (report) => report.goodQty },
  { header: '日历开线时长（小时）', value: (report) => exportNumber(getReportTimeSummary(report).calendarOpenHours) },
  { header: '产线可利用时长（小时）', value: (report) => exportNumber(getReportTimeSummary(report).lineAvailableHours) },
  { header: '定编人数', value: (report) => report.staffing ?? '' },
  { header: '实际出勤人数', value: (report) => report.operators },
  { header: '实际出勤总工时（小时）', value: (report) => exportNumber(getReportTimeSummary(report).actualLaborHours) },
  { header: '理论出勤工时（小时）', value: (report) => exportNumber(getReportTimeSummary(report).theoreticalLaborHours) },
  { header: '标准挣得工时（小时）', value: (report) => exportNumber(report.standardEarnedLaborHours) },
  { header: '人力效率', value: (report) => exportPercent(report.laborEfficiency) },
  { header: '产品明细', value: productDetailsText },
  { header: '创建时间', value: (report) => report.createdAt },
  { header: '更新时间', value: (report) => report.updatedAt },
  { header: '录入人', value: (report) => report.createdBy }
]

export default function DailyReport() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { productionReports, anomalies, settings } = useAppData()
  const { context, invalid } = useMemo(() => readNavigationContext(searchParams, { lines: settings?.lines }), [searchParams, settings?.lines])
  const [filters, setFilters] = useState(() => ({
    startDate: context.date ?? context.startDate ?? '',
    endDate: context.date ?? context.endDate ?? '',
    line: context.line ?? '',
    shift: context.shift ?? '',
    productModel: ''
  }))
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ReportForm | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DailyReport | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<{ type: 'working' | 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (settings) setForm((current) => current ?? createInitialForm(settings))
  }, [settings])

  const computedReports = useMemo(() => computeAllReports(productionReports, anomalies), [anomalies, productionReports])
  const targetReport = useMemo(() => context.reportId ? computedReports.find((report) => report.id === context.reportId) : undefined, [computedReports, context.reportId])
  const targetReportMissing = Boolean(context.reportId && !targetReport)
  const metricLabel = ({ ct: 'CT', achievement: '计划达成率', oee: 'OEE', upph: 'UPPH', yield: '良率', 'labor-gap': '人力工时差', downtime: '停线占比', downturn: '停线占比' } as Record<string, string>)[context.metric ?? ''] ?? context.metric
  const formTimeSummary = getReportTimeSummary({
    shiftHours: form?.shiftHours ?? 0,
    mealBreakHours: form?.mealBreakHours ?? 0,
    operators: form?.operators ?? 0,
    staffing: form?.staffing ?? 0
  })
  const { calendarOpenHours, lineAvailableHours, actualLaborHours, theoreticalLaborHours } = formTimeSummary
  const standardEarnedLaborHours = getStandardEarnedLaborHours(
    (form?.productDetails ?? []).map((detail) => ({
      goodQty: Math.max(0, detail.actualQty - detail.defectQty),
      lineCt: detail.ctSeconds / 3600
    })),
    form?.staffing ?? 0
  )

  const filteredReports = useMemo(() => {
    return computedReports
      .filter((report) => (filters.startDate ? report.date >= filters.startDate : true))
      .filter((report) => (filters.endDate ? report.date <= filters.endDate : true))
      .filter((report) => (filters.line ? report.line === filters.line : true))
      .filter((report) => (filters.shift ? report.shift === filters.shift : true))
      .filter((report) => (filters.productModel ? report.productDetails?.some((detail) => detail.productModel === filters.productModel) ?? report.productModel === filters.productModel : true))
      .sort((a, b) => b.date.localeCompare(a.date) || a.line.localeCompare(b.line))
  }, [computedReports, filters])

  useEffect(() => {
    if (!context.date && !context.startDate && !context.endDate && !context.line && !context.shift) return
    setFilters((current) => ({
      ...current,
      startDate: context.date ?? context.startDate ?? current.startDate,
      endDate: context.date ?? context.endDate ?? current.endDate,
      line: context.line ?? current.line,
      shift: context.shift ?? current.shift
    }))
  }, [context.date, context.endDate, context.line, context.shift, context.startDate])

  useEffect(() => {
    if (!targetReport || !context.reportId) return
    requestAnimationFrame(() => document.getElementById(`daily-report-${context.reportId}`)?.scrollIntoView({ block: 'center' }))
  }, [context.reportId, targetReport, filteredReports.length])

  const clearDrillContext = () => {
    const next = new URLSearchParams(searchParams)
    ;['source', 'metric', 'reportId', 'returnTo'].forEach((key) => next.delete(key))
    setSearchParams(next, { replace: true })
  }
  const returnToEfficiency = () => {
    const returnTo = searchParams.get('returnTo')
    navigate(returnTo?.startsWith('/efficiency') ? returnTo : '/efficiency')
  }

  const updateNumber = (key: keyof Pick<ReportForm, 'shiftHours' | 'mealBreakHours' | 'downtime' | 'staffing' | 'operators'>, value: string) => {
    setForm((current) => current ? { ...current, [key]: Number(value) || 0 } : current)
  }

  const exportReports = async (scope: 'filtered' | 'all') => {
    const reports = scope === 'filtered' ? filteredReports : computedReports
    if (!reports.length) {
      setExportStatus({ type: 'error', message: scope === 'filtered' ? '当前筛选条件下没有可导出的日报。' : '暂无可导出的生产日报。' })
      return
    }
    const dates = reports.map((report) => report.date).sort()
    const filename = `生产日报_${dates[0]}_至_${dates.at(-1)}.csv`
    try {
      setExportStatus({ type: 'working', message: '正在生成导出文件…' })
      const result = await downloadCsv(filename, reportExportColumns, reports)
      setExportStatus({ type: 'success', message: `已导出 ${result.count} 条记录：${result.filename}` })
    } catch (error) {
      setExportStatus({ type: 'error', message: error instanceof Error ? error.message : '导出失败，请重试。' })
    }
  }

  const updateProductDetail = (id: string, key: keyof Omit<ProductDetailForm, 'id'>, value: string) => {
    setForm((current) => current ? {
      ...current,
      productDetails: current.productDetails.map((detail) => {
        if (detail.id !== id) return detail
        if (key === 'productModel') return { ...detail, productModel: value, ctSeconds: settings?.defaultCtSeconds[value] ?? 0 }
        return { ...detail, [key]: Number(value) || 0 }
      })
    } : current)
  }

  const addProductDetail = () => settings && setForm((current) => current ? { ...current, productDetails: [...current.productDetails, createProductDetail(settings)] } : current)
  const removeProductDetail = (id: string) => setForm((current) => current ? {
    ...current,
    productDetails: current.productDetails.length > 1 ? current.productDetails.filter((detail) => detail.id !== id) : current.productDetails
  } : current)

  const closeForm = () => {
    setShowForm(false)
    setEditingReportId(null)
    setSaveError(null)
  }

  const openNewReport = () => {
    if (!settings) return
    setForm(createInitialForm(settings))
    setEditingReportId(null)
    setSaveError(null)
    setShowForm(true)
  }

  const openEditReport = (report: DailyReport) => {
    setForm(createEditForm(report))
    setEditingReportId(report.id)
    setSaveError(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form) return
    if (!settings?.lines.length || !settings.productModels.length || !form.line || form.productDetails.some((detail) => !detail.productModel)) {
      setSaveError('请先新增并选择产线和产品型号，再保存日报。')
      return
    }
    if (form.shiftHours < 0 || form.mealBreakHours < 0 || form.downtime < 0 || form.staffing < 0 || form.operators < 0) {
      setSaveError('班次时长、吃饭时长、计划停机时长和人数不能为负数。')
      return
    }
    if (form.mealBreakHours > form.shiftHours) {
      setSaveError('吃饭时长不能大于班次时长。')
      return
    }
    const productDetails = form.productDetails.map(({ id, ctSeconds, ...detail }) => ({ ...detail, lineCt: ctSeconds / 3600 }))
    const plannedQty = productDetails.reduce((sum, detail) => sum + detail.plannedQty, 0)
    const actualQty = productDetails.reduce((sum, detail) => sum + detail.actualQty, 0)
    const defectQty = productDetails.reduce((sum, detail) => sum + detail.defectQty, 0)
    const actualInboundQty = productDetails.reduce((sum, detail) => sum + Math.max(0, detail.actualQty - detail.defectQty), 0)
    const lineCt = actualInboundQty > 0
      ? productDetails.reduce((sum, detail) => sum + Math.max(0, detail.actualQty - detail.defectQty) * detail.lineCt, 0) / actualInboundQty
      : 0
    const reportValues: Omit<DailyReport, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'dataSource' | 'version' | 'id'> = {
      date: form.date,
      shift: form.shift,
      line: form.line,
      productModel: productDetails.map((detail) => detail.productModel).join(' / '),
      plannedQty,
      actualQty,
      productionTime: calendarOpenHours,
      downtime: form.downtime,
      operators: form.operators,
      staffing: form.staffing,
      defectQty,
      lineCt,
      shiftHours: form.shiftHours,
      mealBreakHours: form.mealBreakHours,
      restBreakHours: 0,
      productDetails
    }
    try {
      setSaveError(null)
      if (editingReportId) await appStore.updateProductionReport(editingReportId, reportValues)
      else await appStore.createProductionReport({ id: `${form.date}-${form.line}-${Date.now()}`, ...reportValues })
      if (settings) setForm(createInitialForm(settings))
      closeForm()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '日报保存失败，请重试。')
    }
  }

  const confirmDeleteReport = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      setDeleteError(null)
      await appStore.deleteProductionReport(deleteTarget.id)
      if (editingReportId === deleteTarget.id) closeForm()
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除日报失败，请重试。')
    } finally {
      setDeleting(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500'
  const readOnlyClass = `${inputClass} bg-slate-50 text-slate-700`
  const labelClass = 'mb-1 block text-xs font-medium text-slate-600'
  const sectionClass = 'col-span-full border-t border-slate-200 pt-4 text-sm font-bold text-slate-800 first:border-t-0 first:pt-0'
  const productInputClass = 'w-full min-w-[92px] rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500'
  const productModelInputClass = 'min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">生产日报</h2>
          <p className="mt-0.5 text-sm text-slate-500">每日生产数据采集与 KPI 自动计算</p>
        </div>
        <button onClick={openNewReport} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700">
          <Plus size={16} />新增日报
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500"><Filter size={16} /><span className="text-sm font-medium">筛选</span></div>
        <div className="flex items-center gap-2"><Search size={16} className="text-slate-400" /><input type="date" aria-label="开始日期" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /><span className="text-slate-400">—</span><input type="date" aria-label="结束日期" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
        <select value={filters.line} onChange={(event) => setFilters((current) => ({ ...current, line: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部产线</option>{(settings?.lines ?? []).map((line) => <option key={line} value={line}>{line}</option>)}</select>
        <select value={filters.shift} onChange={(event) => setFilters((current) => ({ ...current, shift: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部班次</option><option value="白班">白班</option><option value="夜班">夜班</option></select>
        <select value={filters.productModel} onChange={(event) => setFilters((current) => ({ ...current, productModel: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部型号</option>{(settings?.productModels ?? []).map((model) => <option key={model} value={model}>{model}</option>)}</select>
        <button type="button" disabled={!computedReports.length} title={!computedReports.length ? '暂无生产日报，无法导出' : undefined} onClick={() => { setExportStatus(null); setExportDialogOpen(true) }} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} />导出</button>
      </div>

      {context.source === 'efficiency' && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[#e1a300]/40 bg-[#fff8df] px-4 py-3 text-sm text-[#1e1e1e]" role="status"><span className="font-medium">来自效率分析：{context.date ?? `${context.startDate ?? '全部'} 至 ${context.endDate ?? '全部'}`}{context.line ? ` · ${context.line}` : ''}{context.shift ? ` · ${context.shift}` : ''}{metricLabel ? ` · ${metricLabel}` : ''}</span><span className="text-[#787777]">当前匹配 {filteredReports.length} 条日报</span><button type="button" onClick={returnToEfficiency} className="ml-auto font-medium underline underline-offset-2 hover:text-[#950000]">返回效率分析</button><button type="button" onClick={clearDrillContext} className="font-medium underline underline-offset-2 hover:text-[#950000]">清除下钻条件</button></div>}
      {targetReportMissing && <p role="alert" className="rounded-lg border border-[#950000]/25 bg-[#fff1f1] px-4 py-3 text-sm text-[#950000]">目标日报不存在或已删除，已保留其他筛选结果。</p>}
      {invalid.length > 0 && <p role="status" className="text-sm text-[#9b7000]">部分下钻参数无效，已采用安全默认条件：{invalid.join('、')}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [&_th]:!text-center [&_td]:!text-center">
        <div className="overflow-x-auto"><table className="min-w-[2180px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-600"><tr><th className="px-4 py-3">日期</th><th className="px-4 py-3">班次</th><th className="px-4 py-3">产线</th><th className="px-4 py-3">型号</th><th className="px-4 py-3 text-right">CT</th><th className="px-4 py-3 text-right">OEE</th><th className="px-4 py-3 text-right">UPPH</th><th className="px-4 py-3 text-right">计划达成率</th><th className="px-4 py-3 text-right">良率</th><th className="px-4 py-3 text-right">计划下线数</th><th className="px-4 py-3 text-right">实际下线数</th><th className="px-4 py-3 text-right">实际入库数</th><th className="px-4 py-3 text-right">日历开线时长</th><th className="px-4 py-3 text-right">产线可利用时长</th><th className="px-4 py-3 text-right">定编人数</th><th className="px-4 py-3 text-right">实际出勤人数</th><th className="px-4 py-3 text-right">实际出勤总工时</th><th className="px-4 py-3 text-right">标准挣得工时</th><th className="px-4 py-3">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredReports.map((report) => { const { calendarOpenHours, lineAvailableHours, actualLaborHours } = getReportTimeSummary(report); const isTarget = report.id === context.reportId; return <tr id={`daily-report-${report.id}`} key={report.id} className={isTarget ? 'bg-[#fff8df] outline outline-1 outline-[#e1a300]/60' : 'hover:bg-slate-50'}><td className="px-4 py-3 text-slate-700">{report.date}</td><td className="px-4 py-3 text-slate-700">{report.shift ?? '—'}</td><td className="px-4 py-3 font-medium text-slate-800">{report.line}</td><td className="px-4 py-3 text-slate-600">{report.productModel}</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(report.lineCt * 3600, 1)}s</td><td className="px-4 py-3 text-right font-medium text-indigo-600">{formatPercent(report.oee)}</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(report.upph, 1)}</td><td className="px-4 py-3 text-right font-medium text-primary-600">{formatPercent(report.achievementRate)}</td><td className="px-4 py-3 text-right font-medium text-emerald-600">{formatPercent(report.yieldRate)}</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(report.plannedQty)}</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(report.actualQty)}</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(report.goodQty)}</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(calendarOpenHours, 1)}h</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(lineAvailableHours, 1)}h</td><td className="px-4 py-3 text-right text-slate-700">{report.staffing ?? '—'}</td><td className="px-4 py-3 text-right text-slate-700">{report.operators}</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(actualLaborHours, 1)}h</td><td className="px-4 py-3 text-right text-slate-700">{formatNumber(report.standardEarnedLaborHours, 1)}h</td><td className="px-4 py-3"><div className="flex justify-center gap-2"><button type="button" onClick={() => openEditReport(report)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500">编辑</button><button type="button" onClick={() => { setDeleteError(null); setDeleteTarget(report) }} className="rounded-md px-2 py-1 text-xs font-medium text-[#950000] hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#950000]/30">删除</button></div></td></tr> })}</tbody></table></div>
        {filteredReports.length === 0 && <div className="p-8 text-center text-sm text-slate-500">暂无符合条件的数据</div>}
      </div>

      {exportDialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 p-6"><div><h3 className="text-lg font-bold text-slate-800">导出生产日报</h3><p className="mt-1 text-sm text-slate-500">导出为 Excel 可直接打开的 CSV 文件</p></div><button type="button" onClick={() => setExportDialogOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="关闭导出">✕</button></div><div className="space-y-3 p-6"><button type="button" disabled={!filteredReports.length || exportStatus?.type === 'working'} onClick={() => exportReports('filtered')} className="w-full rounded-lg border border-slate-300 p-4 text-left hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="block text-sm font-semibold text-slate-800">导出当前筛选结果</span><span className="mt-1 block text-xs text-slate-500">{filteredReports.length ? `共 ${filteredReports.length} 条记录` : '当前筛选条件下没有数据'}</span></button><button type="button" disabled={!computedReports.length || exportStatus?.type === 'working'} onClick={() => exportReports('all')} className="w-full rounded-lg border border-slate-300 p-4 text-left hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="block text-sm font-semibold text-slate-800">导出全部生产日报</span><span className="mt-1 block text-xs text-slate-500">{computedReports.length ? `共 ${computedReports.length} 条记录` : '暂无日报记录'}</span></button>{exportStatus && <p role="status" className={`text-sm ${exportStatus.type === 'error' ? 'text-[#950000]' : exportStatus.type === 'success' ? 'text-emerald-700' : 'text-slate-600'}`}>{exportStatus.message}</p>}</div><div className="flex justify-end border-t border-slate-100 p-6"><button type="button" onClick={() => setExportDialogOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">关闭</button></div></div></div>}

      {showForm && form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 p-6"><h3 className="text-lg font-bold text-slate-800">{editingReportId ? '编辑生产日报' : '新增生产日报'}</h3><button onClick={closeForm} className="text-slate-400 hover:text-slate-600" aria-label="关闭"><X size={20} /></button></div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 p-6 sm:grid-cols-2">
            <div className={sectionClass}>基础信息</div>
            <div><label className={labelClass}>日期</label><input type="date" value={form.date} onChange={(event) => setForm((current) => current ? ({ ...current, date: event.target.value }) : current)} className={inputClass} /></div>
            <div><label className={labelClass}>班次</label><select value={form.shift} onChange={(event) => setForm((current) => current ? ({ ...current, shift: event.target.value as ReportForm['shift'] }) : current)} className={inputClass}><option value="白班">白班</option><option value="夜班">夜班</option></select></div>
            <div><div className="flex h-5 items-center"><label className={`${labelClass} !mb-0 leading-5`}>产线</label><ReferenceDataActions kind="line" selectedValue={form.line} onSaved={(result, mode, previous) => { setForm((current) => current ? ({ ...current, line: mode === 'create' || current.line === previous ? result.value : current.line }) : current); if (mode === 'edit' && previous) setFilters((current) => current.line === previous ? { ...current, line: result.value } : current) }} /></div><select value={form.line} onChange={(event) => setForm((current) => current ? ({ ...current, line: event.target.value }) : current)} className={inputClass}><option value="" disabled>暂无产线</option>{(settings?.lines ?? []).map((line) => <option key={line} value={line}>{line}</option>)}</select></div>
            <div className={sectionClass}>产能 / 产品明细</div>
            <div className="col-span-full overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full table-fixed text-sm">
                <colgroup><col className="w-[300px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[60px]" /></colgroup>
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-2 py-2 text-left font-medium">产品型号</th><th className="px-2 py-2 text-left font-medium">计划下线数</th><th className="px-2 py-2 text-left font-medium">实际下线数</th><th className="px-2 py-2 text-left font-medium">不良品数</th><th className="whitespace-nowrap px-1 py-2 text-left font-medium">实际入库数 <span className="ml-0.5 inline-block whitespace-nowrap rounded bg-primary-50 px-1 py-px align-baseline text-[8px] text-primary-600">自动计算</span></th><th className="px-2 py-2 text-left font-medium">CT（秒）</th><th className="px-2 py-2 text-center font-medium">操作</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {form.productDetails.map((detail) => {
                    const actualInboundQty = Math.max(0, detail.actualQty - detail.defectQty)
                    return <tr key={detail.id}>
                      <td className="p-2"><div className="flex w-full items-center gap-1"><select value={detail.productModel} onChange={(event) => updateProductDetail(detail.id, 'productModel', event.target.value)} className={productModelInputClass}><option value="" disabled>暂无型号</option>{(settings?.productModels ?? []).map((model) => <option key={model} value={model}>{model}</option>)}</select><ReferenceDataActions kind="productModel" selectedValue={detail.productModel} onSaved={(result, mode, previous) => { setForm((current) => current ? ({ ...current, productDetails: current.productDetails.map((item) => item.id === detail.id && (mode === 'create' || item.productModel === previous) ? { ...item, productModel: result.value, ctSeconds: result.defaultCtSeconds ?? item.ctSeconds } : item) }) : current); if (mode === 'edit' && previous) setFilters((current) => current.productModel === previous ? { ...current, productModel: result.value } : current) }} /></div></td>
                      <td className="p-2"><input type="number" min="0" value={detail.plannedQty} onChange={(event) => updateProductDetail(detail.id, 'plannedQty', event.target.value)} className={productInputClass} /></td>
                      <td className="p-2"><input type="number" min="0" value={detail.actualQty} onChange={(event) => updateProductDetail(detail.id, 'actualQty', event.target.value)} className={productInputClass} /></td>
                      <td className="p-2"><input type="number" min="0" value={detail.defectQty} onChange={(event) => updateProductDetail(detail.id, 'defectQty', event.target.value)} className={productInputClass} /></td>
                      <td className="p-2"><input readOnly value={actualInboundQty} className={`${productInputClass} bg-slate-50 text-slate-700`} /></td>
                      <td className="p-2"><input type="number" min="0" step="0.1" value={detail.ctSeconds} onChange={(event) => updateProductDetail(detail.id, 'ctSeconds', event.target.value)} className={productInputClass} /></td>
                      <td className="p-2 text-center"><button type="button" disabled={form.productDetails.length === 1} onClick={() => removeProductDetail(detail.id)} aria-label={`删除 ${detail.productModel}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-50 hover:text-[#950000] disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={16} /></button></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
            <div className="col-span-full"><button type="button" onClick={addProductDetail} disabled={!settings?.productModels.length} className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50">+ 增加型号</button></div>
            <div className="col-span-full pt-2 text-sm font-bold text-slate-800">开班时间</div>
            <div><label className={labelClass}>班次时长（小时）</label><input type="number" min="0" step="0.1" value={form.shiftHours} onChange={(event) => updateNumber('shiftHours', event.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>吃饭时长（小时）</label><input type="number" min="0" step="0.1" value={form.mealBreakHours} onChange={(event) => updateNumber('mealBreakHours', event.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>日历开线时长（小时） <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-600">自动计算</span></label><input readOnly value={calendarOpenHours} className={readOnlyClass} /><p className="mt-1 text-xs text-slate-400">等于班次时长</p></div>
            <div><label className={labelClass}>计划停机时长（小时）</label><input type="number" min="0" step="0.1" value={form.downtime} onChange={(event) => updateNumber('downtime', event.target.value)} className={inputClass} /></div>
            <div className="col-span-full"><label className={labelClass}>产线可利用时长（小时） <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-600">自动计算</span></label><input readOnly value={lineAvailableHours} className={readOnlyClass} /><p className="mt-1 text-xs text-slate-400">日历开线时长 − 吃饭时长</p></div>

            <div className={sectionClass}>人力</div>
            <div><label className={labelClass}>定编人数</label><input type="number" min="0" value={form.staffing} onChange={(event) => updateNumber('staffing', event.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>实际出勤人数</label><input type="number" min="0" value={form.operators} onChange={(event) => updateNumber('operators', event.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>实际出勤总工时（小时） <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-600">自动计算</span></label><input readOnly value={actualLaborHours} className={readOnlyClass} /><p className="mt-1 text-xs text-slate-400">实际出勤人数 × 产线可利用时长</p></div>
            <div><label className={labelClass}>理论出勤工时（小时） <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-600">自动计算</span></label><input readOnly value={theoreticalLaborHours} className={readOnlyClass} /><p className="mt-1 text-xs text-slate-400">定编人数 × 产线可利用时长</p></div>
            <div className="col-span-full"><label className={labelClass}>标准挣得工时（小时） <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-600">自动计算</span></label><input readOnly value={formatNumber(standardEarnedLaborHours, 1)} className={readOnlyClass} /><p className="mt-1 text-xs text-slate-400">Σ（各型号实际入库数 × CT × 线体定编人数）</p></div>
          </div>
          <div className="border-t border-slate-100 p-6"><div className="flex items-center justify-end gap-3">{saveError && <p className="mr-auto text-sm text-[#950000]">{saveError}</p>}<button onClick={closeForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">取消</button><button onClick={handleSave} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{editingReportId ? '保存修改' : '保存并计算'}</button></div></div>
        </div>
      </div>}
      {deleteTarget && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="delete-report-title"><div className="w-full max-w-md rounded-2xl bg-white shadow-xl"><div className="border-b border-slate-100 p-6"><h3 id="delete-report-title" className="text-lg font-bold text-slate-800">删除生产日报</h3><p className="mt-2 text-sm text-slate-600">将删除 {deleteTarget.date} · {deleteTarget.line} · {deleteTarget.shift ?? '未设班次'} 的日报及其全部产品明细。此操作不可恢复。</p></div><div className="p-6">{deleteError && <p role="alert" className="text-sm text-[#950000]">{deleteError}</p>}<p className="text-xs text-slate-500">该记录的日报、驾驶舱、效率分析与导出结果会立即同步更新。</p></div><div className="flex justify-end gap-3 border-t border-slate-100 p-6"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">取消</button><button type="button" disabled={deleting} onClick={confirmDeleteReport} className="rounded-lg bg-[#950000] px-4 py-2 text-sm font-medium text-white hover:bg-[#760000] disabled:opacity-50">{deleting ? '正在删除…' : '确认删除'}</button></div></div></div>}
    </div>
  )
}
