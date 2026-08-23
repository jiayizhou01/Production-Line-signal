import { useEffect, useMemo, useState } from 'react'
import { Plus, AlertTriangle, Clock, Download, Filter, RotateCcw, ChevronRight } from 'lucide-react'
import type { Anomaly } from '../types'
import AnomalyAnalytics from '../components/AnomalyAnalytics'
import { appStore, useAppData } from '../store/appStore'
import { ANOMALY_RECURRENCE_WINDOW_DAYS } from '../config/anomalyRules'
import { getAnomalyRecurrence } from '../services/anomalyRecurrence'
import { readNavigationContext, updateNavigationContext } from '../services/navigationContext'
import { useSearchParams } from 'react-router-dom'
import { downloadCsv, type CsvColumn } from '../services/csvExport'
import ReferenceDataActions from '../components/ReferenceDataActions'
import { getAnomalyTypeColor, getAnomalyTypeName, getDefaultDepartmentForAnomalyType } from '../services/referenceData'
import { getPreviousLocalDateTime } from '../services/dateDefaults'

const statusLabels: Record<Anomaly['status'], string> = {
  pending: '待处理',
  processing: '处理中',
  closed: '已关闭'
}

const exportText = (value: string | undefined, fallback = '未填写') => value?.trim() || fallback

const createInitialAnomalyForm = (): Partial<Anomaly> => ({
  type: 'equipment',
  line: '',
  startTime: getPreviousLocalDateTime('09:00'),
  endTime: getPreviousLocalDateTime('09:30'),
  shift: '白班',
  stationName: '',
  impactType: 'stop',
  impactMinutes: 30,
  department: '',
  description: '',
  action: '',
  status: 'pending'
})

const createAnomalyExportColumns = (anomalies: Anomaly[], settings: ReturnType<typeof useAppData>['settings']): CsvColumn<Anomaly>[] => [
  { header: '异常编号', value: (anomaly) => anomaly.id },
  { header: '开始时间', value: (anomaly) => anomaly.startTime },
  { header: '结束时间', value: (anomaly) => exportText(anomaly.endTime) },
  { header: '班次', value: (anomaly) => exportText(anomaly.shift) },
  { header: '产线', value: (anomaly) => anomaly.line },
  { header: '工位名称', value: (anomaly) => exportText(anomaly.stationName) },
  { header: '异常类型', value: (anomaly) => getAnomalyTypeName(settings, anomaly.type) },
  { header: '影响类型', value: (anomaly) => anomaly.impactType === 'nonstop' ? '未停线' : '停线' },
  { header: '停线时长（分钟）', value: (anomaly) => anomaly.impactMinutes },
  { header: '异常描述', value: (anomaly) => anomaly.description },
  { header: '责任部门', value: (anomaly) => anomaly.department },
  { header: '责任人', value: () => '未填写' },
  { header: '计划完成日期', value: () => '未填写' },
  { header: '是否逾期', value: () => '未设置' },
  { header: '临时措施', value: (anomaly) => exportText(anomaly.action) },
  { header: '根本原因', value: () => '未填写' },
  { header: '永久改善措施', value: () => '未填写' },
  { header: '验证人', value: () => '未填写' },
  { header: '验证结论', value: () => '未填写' },
  { header: '重复发生次数', value: (anomaly) => getAnomalyRecurrence(anomaly, anomalies).recurrenceCount },
  { header: '任务状态', value: (anomaly) => statusLabels[anomaly.status] },
  { header: '创建时间', value: (anomaly) => anomaly.createdAt },
  { header: '更新时间', value: (anomaly) => anomaly.updatedAt }
]

 export default function AnomalyManagement() {
   const [searchParams, setSearchParams] = useSearchParams()
   const { anomalies, productionReports, settings } = useAppData()
   const [activeTab, setActiveTab] = useState<'records' | 'analysis'>('records')
   const [filters, setFilters] = useState({ startDate: '', endDate: '', status: '', type: '', line: '', shift: '', station: '' })
   const [sortBy, setSortBy] = useState<'latest' | 'earliest' | 'impact' | 'status' | 'recurrence'>('latest')
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<Anomaly | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [recurrenceHistoryFor, setRecurrenceHistoryFor] = useState<Anomaly | null>(null)
   const [exportDialogOpen, setExportDialogOpen] = useState(false)
   const [exportStatus, setExportStatus] = useState<{ type: 'working' | 'success' | 'error'; message: string } | null>(null)
   const [form, setForm] = useState<Partial<Anomaly>>(createInitialAnomalyForm)
   const [saveError, setSaveError] = useState<string | null>(null)
   const { context, invalid } = useMemo(
     () => readNavigationContext(searchParams, { lines: settings?.lines, stations: settings?.stations }),
     [searchParams, settings?.lines, settings?.stations]
   )

   const filtered = useMemo(() => {
     const statusRank: Record<Anomaly['status'], number> = { pending: 0, processing: 1, closed: 2 }
     const timestampOf = (anomaly: Anomaly) => new Date(anomaly.startTime.replace(' ', 'T')).getTime() || 0

     return anomalies
       .filter((a) => (filters.startDate ? a.startTime.slice(0, 10) >= filters.startDate : true))
       .filter((a) => (filters.endDate ? a.startTime.slice(0, 10) <= filters.endDate : true))
       .filter((a) => (filters.status ? a.status === filters.status : true))
       .filter((a) => (filters.type ? a.type === filters.type : true))
       .filter((a) => (filters.line ? a.line === filters.line : true))
       .filter((a) => (filters.shift ? a.shift === filters.shift : true))
       .filter((a) => (filters.station ? a.stationName === filters.station : true))
       .sort((left, right) => {
         if (sortBy === 'earliest') return timestampOf(left) - timestampOf(right)
         if (sortBy === 'impact') return right.impactMinutes - left.impactMinutes || timestampOf(right) - timestampOf(left)
         if (sortBy === 'status') return statusRank[left.status] - statusRank[right.status] || timestampOf(right) - timestampOf(left)
         if (sortBy === 'recurrence') return getAnomalyRecurrence(right, anomalies).recurrenceCount - getAnomalyRecurrence(left, anomalies).recurrenceCount || timestampOf(right) - timestampOf(left)
         return timestampOf(right) - timestampOf(left)
       })
   }, [anomalies, filters, sortBy])

   const statusBadge = (status: Anomaly['status']) => {
     const styles = {
       pending: 'bg-red-50 text-red-600',
       processing: 'bg-amber-50 text-amber-600',
       closed: 'bg-emerald-50 text-emerald-600'
     }
     const labels = { pending: '待处理', processing: '处理中', closed: '已关闭' }
     return (
       <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
         {labels[status]}
       </span>
     )
   }

   const recurrenceByAnomalyId = useMemo(() => new Map(
     anomalies.map((anomaly) => [anomaly.id, getAnomalyRecurrence(anomaly, anomalies)])
   ), [anomalies])

   const closeForm = () => {
     setShowForm(false)
     setEditingId(null)
   }

   const updateRecordFilters = (updates: Partial<typeof filters>) => {
     const next = { ...filters, ...updates }
     setFilters(next)
     setSearchParams(updateNavigationContext(searchParams, { ...next, date: undefined, anomalyId: undefined }), { replace: true })
   }

   const exportAnomalies = async (scope: 'filtered' | 'all') => {
     const records = scope === 'filtered' ? filtered : anomalies
     if (!records.length) {
       setExportStatus({ type: 'error', message: scope === 'filtered' ? '当前筛选条件下没有可导出的异常记录。' : '暂无可导出的异常记录。' })
       return
     }

     const dates = records.map((record) => record.startTime.slice(0, 10)).sort()
     const linePrefix = scope === 'filtered' && filters.line ? `${filters.line}_` : ''
     const filename = `异常记录_${linePrefix}${dates[0]}_至_${dates.at(-1)}.csv`
     try {
       setExportStatus({ type: 'working', message: '正在生成导出文件…' })
       const result = await downloadCsv(filename, createAnomalyExportColumns(anomalies, settings), records)
       setExportStatus({ type: 'success', message: `已导出 ${result.count} 条记录：${result.filename}` })
     } catch (error) {
       setExportStatus({ type: 'error', message: error instanceof Error ? error.message : '导出失败，请重试。' })
     }
   }

   const handleSave = async () => {
     if (!form.type || !form.line || !form.stationName?.trim() || !form.department || !form.startTime || !form.endTime) {
       setSaveError('请完整填写产线、工位名称、异常类型、责任部门、开始时间和结束时间。')
       return
     }
     const values = {
       type: form.type,
       line: form.line,
       startTime: form.startTime.replace('T', ' '),
       endTime: form.endTime.replace('T', ' '),
       shift: form.shift,
       stationName: form.stationName || '',
       impactType: form.impactType || 'stop',
       impactMinutes: form.impactType === 'nonstop' ? 0 : Number(form.impactMinutes) || 0,
       department: form.department || '',
       description: form.description || '',
       action: form.action || '',
       status: form.status || 'pending'
     }
     try {
       setSaveError(null)
       if (editingId) await appStore.updateAnomaly(editingId, values)
       else await appStore.createAnomaly({ id: `ANM-${2000 + anomalies.length}`, ...values })
       closeForm()
     } catch (error) {
       setSaveError(error instanceof Error ? error.message : '异常保存失败，请重试。')
     }
   }

   const openEdit = (anomaly: Anomaly) => {
     setEditingId(anomaly.id)
     setForm({
       ...anomaly,
       startTime: anomaly.startTime.replace(' ', 'T'),
       endTime: anomaly.endTime?.replace(' ', 'T') || ''
     })
     setShowForm(true)
   }

   useEffect(() => {
     setFilters((current) => ({
       ...current,
       startDate: context.date ?? context.startDate ?? '',
       endDate: context.date ?? context.endDate ?? '',
       line: context.line ?? '',
       shift: context.shift ?? '',
       station: context.station ?? ''
     }))
     if (context.anomalyId) setActiveTab('records')
    else if (context.metric === 'downtime') setActiveTab('analysis')
   }, [context.anomalyId, context.date, context.endDate, context.line, context.metric, context.shift, context.source, context.startDate, context.station])

   useEffect(() => {
     if (!context.anomalyId) return
     const anomaly = anomalies.find((item) => item.id === context.anomalyId)
     if (anomaly) openEdit(anomaly)
     else setSaveError(`未找到异常记录：${context.anomalyId}`)
   }, [anomalies, context.anomalyId])

    const updateStatus = async (id: string, status: Anomaly['status']) => {
     try {
       setSaveError(null)
       await appStore.updateAnomaly(id, { status, ...(status === 'closed' ? { action: '已完成处理' } : {}) })
     } catch (error) {
       setSaveError(error instanceof Error ? error.message : '状态更新失败，请重试。')
      }
    }

    const confirmDeleteAnomaly = async () => {
      if (!deleteTarget) return
      try {
        setDeleting(true)
        setDeleteError(null)
        await appStore.deleteAnomaly(deleteTarget.id)
        if (editingId === deleteTarget.id) closeForm()
        setDeleteTarget(null)
      } catch (error) {
        setDeleteError(error instanceof Error ? error.message : '删除异常记录失败，请重试。')
      } finally {
        setDeleting(false)
      }
    }

  const updateImpactType = (impactType: 'stop' | 'nonstop') => {
    setForm((current) => ({ ...current, impactType, impactMinutes: impactType === 'nonstop' ? 0 : current.impactMinutes }))
  }

   const updateAnomalyType = (type: Anomaly['type']) => {
    setForm((current) => ({ ...current, type, department: getDefaultDepartmentForAnomalyType(type) || current.department }))
  }

   const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
   const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

   return (
     <div className="space-y-6">
       <div className="flex items-center justify-between">
         <div>
           <h2 className="text-xl font-bold text-slate-800">异常管理</h2>
           <p className="text-sm text-slate-500 mt-0.5">制造现场异常登记、追踪与闭环处理</p>
         </div>
         {activeTab === 'records' && <div className="flex items-center gap-2">
         <button
           type="button"
           disabled={!anomalies.length}
           title={!anomalies.length ? '暂无异常记录，无法导出' : undefined}
           onClick={() => { setExportStatus(null); setExportDialogOpen(true) }}
           className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
         >
           <Download size={16} />
           导出
         </button>
         <button
           onClick={() => { setEditingId(null); setSaveError(null); setForm({ ...createInitialAnomalyForm(), type: settings?.anomalyTypes[0]?.id ?? '', line: settings?.lines[0] ?? '', stationName: settings?.stations[0] ?? '', department: settings?.departments[0] ?? '' }); setShowForm(true) }}
           className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
         >
           <Plus size={16} />
           登记异常
         </button></div>}
       </div>

       <div className="flex gap-6 border-b border-slate-200">
         <button onClick={() => setActiveTab('records')} className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${activeTab === 'records' ? 'border-primary-600 text-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>异常记录</button>
         <button onClick={() => setActiveTab('analysis')} className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${activeTab === 'analysis' ? 'border-primary-600 text-slate-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>异常分析</button>
       </div>

        {activeTab === 'analysis' ? <AnomalyAnalytics anomalies={anomalies} reports={productionReports} lines={settings?.lines ?? []} stations={settings?.stations ?? []} anomalyTypes={settings?.anomalyTypes ?? []} /> : <>
       <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-4">
         <div className="flex items-center gap-2 text-slate-500">
           <Filter size={16} />
           <span className="text-sm font-medium">筛选</span>
         </div>
         <div className="flex items-center gap-2"><input type="date" aria-label="开始日期" value={filters.startDate} onChange={(e) => updateRecordFilters({ startDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /><span className="text-slate-400">—</span><input type="date" aria-label="结束日期" value={filters.endDate} onChange={(e) => updateRecordFilters({ endDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
         <select value={filters.line} onChange={(e) => updateRecordFilters({ line: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
           <option value="">全部产线</option>
            {(settings?.lines ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
         </select>
         <select value={filters.shift} onChange={(e) => updateRecordFilters({ shift: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部班次</option><option value="白班">白班</option><option value="夜班">夜班</option></select>
         <select value={filters.station} onChange={(e) => updateRecordFilters({ station: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"><option value="">全部工位</option>{(settings?.stations ?? []).map((station) => <option key={station} value={station}>{station}</option>)}</select>
         <select value={filters.status} onChange={(e) => updateRecordFilters({ status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
           <option value="">全部状态</option>
           <option value="pending">待处理</option>
           <option value="processing">处理中</option>
           <option value="closed">已关闭</option>
         </select>
         <select value={filters.type} onChange={(e) => updateRecordFilters({ type: e.target.value as Anomaly['type'] })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
           <option value="">全部类型</option>
           {(settings?.anomalyTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
         </select>
         <select aria-label="排序方式" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
           <option value="latest">最新发生</option>
           <option value="earliest">最早发生</option>
           <option value="impact">停线时长：高到低</option>
           <option value="status">处理状态：待处理优先</option>
           <option value="recurrence">复发次数：高到低</option>
         </select>
       </div>
       {invalid.length > 0 && <p role="status" className="text-xs text-[#9b7000]">部分链接条件无效，已采用默认筛选：{invalid.join('、')}</p>}

       <div className="grid gap-4">
         {filtered.map((a) => {
           const recurrence = recurrenceByAnomalyId.get(a.id)
           return (
           <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex items-start gap-4">
                 <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${getAnomalyTypeColor(a.type)}`}>
                   <AlertTriangle size={20} />
                 </div>
                 <div>
                   <div className="flex items-center gap-2 flex-wrap">
                     <span className="font-bold text-slate-800">{a.id}</span>
                     <span className={`px-2 py-0.5 rounded text-xs font-medium ${getAnomalyTypeColor(a.type)}`}>{getAnomalyTypeName(settings, a.type)}</span>
                     {statusBadge(a.status)}
                   </div>
                   <div className="flex items-center gap-4 mt-1 text-xs font-semibold text-slate-500">
                     <span className="flex items-center gap-1"><Clock size={12} /> {a.startTime}</span>
                     <span>{a.line}</span>
                     {a.stationName && <span>{a.stationName}</span>}
                     <span>{a.department}</span>
                     {recurrence && recurrence.recurrenceCount > 0 && (
                       <button
                         type="button"
                         onClick={() => setRecurrenceHistoryFor(a)}
                         className="inline-flex items-center gap-1 font-semibold text-[#950000] underline decoration-[#950000]/35 underline-offset-4 transition-colors hover:text-[#6b0000] hover:decoration-[#950000] focus:outline-none focus:ring-2 focus:ring-[#950000]/25"
                         title="查看相关历史异常"
                       >
                         <RotateCcw size={12} aria-hidden="true" />
                         近 {ANOMALY_RECURRENCE_WINDOW_DAYS} 天复发 {recurrence.recurrenceCount} 次
                         <ChevronRight size={12} aria-hidden="true" />
                       </button>
                     )}
                   </div>
                   <p className="text-sm text-slate-700 mt-2">{a.description}</p>
                   {a.action && (
                     <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5 inline-block">
                       改善措施：{a.action}
                     </div>
                   )}
                 </div>
               </div>
               <div className="flex flex-col items-end gap-2">
                 <div className="text-lg font-bold text-slate-800">{a.impactMinutes} <span className="text-sm font-normal text-slate-500">min</span></div>
                 <div className="flex items-center gap-2">
                   {a.status === 'pending' && (
                     <button onClick={() => updateStatus(a.id, 'processing')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100">开始处理</button>
                   )}
                    {(a.status === 'pending' || a.status === 'processing') && (
                      <button onClick={() => updateStatus(a.id, 'closed')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100">关闭</button>
                    )}
                    <button type="button" onClick={() => { setDeleteError(null); setDeleteTarget(a) }} className="px-3 py-1.5 text-xs font-medium rounded-lg text-[#950000] hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#950000]/30">删除</button>
                    <button onClick={() => openEdit(a)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">查看</button>
                 </div>
               </div>
             </div>
           </div>
           )
         })}
         {filtered.length === 0 && (
           <div className="p-8 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">暂无异常记录</div>
         )}
       </div>
       </>}

       {exportDialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
         <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
           <div className="flex items-center justify-between border-b border-slate-100 p-6">
             <div>
               <h3 className="text-lg font-bold text-slate-800">导出异常记录</h3>
               <p className="mt-1 text-sm text-slate-500">导出为 Excel 可直接打开的 CSV 文件</p>
             </div>
             <button type="button" onClick={() => setExportDialogOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="关闭导出">✕</button>
           </div>
           <div className="space-y-3 p-6">
             <button type="button" disabled={!filtered.length || exportStatus?.type === 'working'} onClick={() => exportAnomalies('filtered')} className="w-full rounded-lg border border-slate-300 p-4 text-left hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50">
               <span className="block text-sm font-semibold text-slate-800">导出当前筛选结果</span>
               <span className="mt-1 block text-xs text-slate-500">{filtered.length ? `共 ${filtered.length} 条记录` : '当前筛选条件下没有数据'}</span>
             </button>
             <button type="button" disabled={!anomalies.length || exportStatus?.type === 'working'} onClick={() => exportAnomalies('all')} className="w-full rounded-lg border border-slate-300 p-4 text-left hover:border-primary-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50">
               <span className="block text-sm font-semibold text-slate-800">导出全部异常记录</span>
               <span className="mt-1 block text-xs text-slate-500">{anomalies.length ? `共 ${anomalies.length} 条记录` : '暂无异常记录'}</span>
             </button>
             {exportStatus && <p role="status" className={`text-sm ${exportStatus.type === 'error' ? 'text-[#950000]' : exportStatus.type === 'success' ? 'text-emerald-700' : 'text-slate-600'}`}>{exportStatus.message}</p>}
           </div>
           <div className="flex justify-end border-t border-slate-100 p-6">
             <button type="button" onClick={() => setExportDialogOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">关闭</button>
           </div>
         </div>
       </div>}

       {showForm && (
         <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
             <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <h3 className="text-lg font-bold text-slate-800">{editingId ? '异常详情' : '登记异常'}</h3>
                {editingId && <span className="text-sm text-slate-400">{editingId}</span>}
              </div>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">✕</button>
             </div>
             <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
               <div>
                 <label className={labelClass}>开始时间</label>
                 <input type="datetime-local" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className={inputClass} />
               </div>
               <div>
                 <label className={labelClass}>结束时间</label>
                 <input type="datetime-local" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className={inputClass} />
               </div>
               <div>
                 <label className={labelClass}>班次</label>
                 <select value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value as Anomaly['shift'] }))} className={inputClass}>
                   <option value="白班">白班</option><option value="夜班">夜班</option>
                 </select>
               </div>
               <div>
                 <div className="flex h-5 items-center"><label className={`${labelClass} !mb-0 leading-5`}>产线</label><ReferenceDataActions kind="line" selectedValue={form.line} onSaved={(result, mode, previous) => { setForm((current) => ({ ...current, line: mode === 'create' || current.line === previous ? result.value : current.line })); if (mode === 'edit' && previous) updateRecordFilters({ line: filters.line === previous ? result.value : filters.line }) }} /></div>
                 <select value={form.line} onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))} className={inputClass}><option value="" disabled>暂无产线</option>{(settings?.lines ?? []).map((line) => <option key={line} value={line}>{line}</option>)}</select>
               </div>
               <div>
                 <div className="flex h-5 items-center"><label className={`${labelClass} !mb-0 leading-5`}>工位名称</label><ReferenceDataActions kind="station" selectedValue={form.stationName} onSaved={(result, mode, previous) => { setForm((current) => ({ ...current, stationName: mode === 'create' || current.stationName === previous ? result.value : current.stationName })); if (mode === 'edit' && previous) updateRecordFilters({ station: filters.station === previous ? result.value : filters.station }) }} /></div>
                 <input list="station-options" type="text" value={form.stationName} onChange={(e) => setForm((f) => ({ ...f, stationName: e.target.value }))} className={inputClass} placeholder="暂无工位，请新增" /><datalist id="station-options">{(settings?.stations ?? []).map((station) => <option key={station} value={station} />)}</datalist>
               </div>
               <div>
                 <div className="flex h-5 items-center"><label className={`${labelClass} !mb-0 leading-5`}>异常类型</label><ReferenceDataActions kind="anomalyType" selectedValue={form.type} onSaved={(result, mode, previous) => setForm((current) => ({ ...current, type: mode === 'create' || current.type === previous ? result.value : current.type }))} /></div>
                 <select value={form.type} onChange={(e) => updateAnomalyType(e.target.value as Anomaly['type'])} className={inputClass}><option value="" disabled>暂无异常类型</option>{(settings?.anomalyTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
               </div>
               <div>
                 <label className={labelClass}>影响类型</label>
                 <select value={form.impactType} onChange={(e) => updateImpactType(e.target.value as 'stop' | 'nonstop')} className={inputClass}>
                   <option value="stop">停线</option><option value="nonstop">未停线</option>
                 </select>
               </div>
               <div>
                 <label className={labelClass}>停线时长（分钟）</label>
                 <input type="number" min="0" disabled={form.impactType === 'nonstop'} value={form.impactMinutes} onChange={(e) => setForm((f) => ({ ...f, impactMinutes: Number(e.target.value) || 0 }))} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`} />
               </div>
               <div className="sm:col-span-2">
                 <label className={labelClass}>异常描述</label>
                 <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputClass} placeholder="请描述异常现象" />
               </div>
               <div>
                 <div className="flex h-5 items-center"><label className={`${labelClass} !mb-0 leading-5`}>责任部门</label><ReferenceDataActions kind="department" selectedValue={form.department} onSaved={(result, mode, previous) => setForm((current) => ({ ...current, department: mode === 'create' || current.department === previous ? result.value : current.department }))} /></div>
                 <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className={inputClass}><option value="" disabled>暂无责任部门</option>{(settings?.departments ?? []).map((department) => <option key={department} value={department}>{department}</option>)}</select>
               </div>
               <div>
                 <label className={labelClass}>任务状态</label>
                 <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Anomaly['status'] }))} className={inputClass}>
                   <option value="pending">待处理</option><option value="processing">处理中</option><option value="closed">已关闭</option>
                 </select>
               </div>
               <div className="sm:col-span-2">
                 <label className={labelClass}>初步改善措施</label>
                 <input type="text" value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} className={inputClass} placeholder="请填写初步改善措施" />
               </div>
             </div>
              <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
               {saveError && <p className="mr-auto text-sm text-[#950000]">{saveError}</p>}
              <button onClick={closeForm} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50">取消</button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">{editingId ? '保存修改' : '保存'}</button>
             </div>
           </div>
         </div>
       )}
        {recurrenceHistoryFor && (() => {
         const recurrence = recurrenceByAnomalyId.get(recurrenceHistoryFor.id)
         return (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
             <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl">
               <div className="flex items-start justify-between border-b border-slate-100 p-6">
                 <div>
                   <h3 className="text-lg font-bold text-slate-800">复发历史异常</h3>
                   <p className="mt-1 text-sm text-slate-500">{ANOMALY_RECURRENCE_WINDOW_DAYS} 天内 · {recurrenceHistoryFor.line} · {recurrenceHistoryFor.stationName} · {getAnomalyTypeName(settings, recurrenceHistoryFor.type)}</p>
                 </div>
                 <button type="button" onClick={() => setRecurrenceHistoryFor(null)} className="text-slate-400 hover:text-slate-600" aria-label="关闭复发历史">✕</button>
               </div>
               <div className="space-y-3 p-6">
                 {recurrence?.relatedAnomalies.map((history) => (
                   <div key={history.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4">
                     <div>
                       <div className="flex flex-wrap items-center gap-2">
                         <span className="font-semibold text-slate-800">{history.id}</span>
                         <span className={`rounded px-2 py-0.5 text-xs font-medium ${getAnomalyTypeColor(history.type)}`}>{getAnomalyTypeName(settings, history.type)}</span>
                         {statusBadge(history.status)}
                       </div>
                       <p className="mt-2 text-xs font-medium text-slate-500">{history.startTime} · {history.shift ?? '—'} · 停线 {history.impactMinutes} min</p>
                       <p className="mt-2 text-sm text-slate-700">{history.description}</p>
                     </div>
                     <button type="button" onClick={() => { setRecurrenceHistoryFor(null); openEdit(history) }} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">查看</button>
                   </div>
                 ))}
               </div>
             </div>
           </div>
         )
        })()}
        {deleteTarget && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="delete-anomaly-title"><div className="w-full max-w-md rounded-2xl bg-white shadow-xl"><div className="border-b border-slate-100 p-6"><h3 id="delete-anomaly-title" className="text-lg font-bold text-slate-800">删除异常记录</h3><p className="mt-2 text-sm text-slate-600">将删除异常 {deleteTarget.id}：{deleteTarget.startTime} · {deleteTarget.line} · {deleteTarget.stationName || '未填写工位'}。此操作不可恢复。</p></div><div className="p-6"><p className="text-xs text-slate-500">异常分析、复发提醒、驾驶舱风险与 AI 历史引用会立即同步更新。</p>{deleteError && <p role="alert" className="mt-3 text-sm text-[#950000]">{deleteError}</p>}</div><div className="flex justify-end gap-3 border-t border-slate-100 p-6"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">取消</button><button type="button" disabled={deleting} onClick={confirmDeleteAnomaly} className="rounded-lg bg-[#950000] px-4 py-2 text-sm font-medium text-white hover:bg-[#760000] disabled:opacity-50">{deleting ? '正在删除…' : '确认删除'}</button></div></div></div>}
    </div>
   )
 }
