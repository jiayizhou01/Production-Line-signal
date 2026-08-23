 import { useState } from 'react'
 import { NavLink, Outlet, useLocation } from 'react-router-dom'
 import {
   LayoutDashboard,
   FileText,
   BarChart3,
   AlertTriangle,
   Bot,
   Bell,
   Factory,
   Download,
   Database,
   Trash2
  } from 'lucide-react'
 import { appStore, useAppData } from '../store/appStore'
 import { downloadDataBackup } from '../services/backupService'

 const navItems = [
   { to: '/', label: '驾驶舱', icon: LayoutDashboard },
   { to: '/daily-report', label: '生产日报', icon: FileText },
   { to: '/efficiency', label: '效率分析', icon: BarChart3 },
   { to: '/anomalies', label: '异常管理', icon: AlertTriangle },
   { to: '/ai-assistant', label: 'AI 制造助手', icon: Bot }
 ]

  export default function Layout() {
    const location = useLocation()
    const { loading, error, productionReports, anomalies, actions, aiMessages, settings, users } = useAppData()
    const [backupMessage, setBackupMessage] = useState<string | null>(null)
    const [demoMessage, setDemoMessage] = useState<string | null>(null)
    const [demoBusy, setDemoBusy] = useState(false)
    const activeLabel = navItems.find((n) => n.to === location.pathname)?.label || '驾驶舱'
    const businessRecords = [...productionReports, ...anomalies, ...actions, ...aiMessages]
    const hasManualData = businessRecords.some((record) => record.dataSource === 'manual')
    const hasDemoReferenceData = Boolean(settings && Object.values(settings.seedReferenceValues ?? {}).some((values) => values.length > 0))
    const hasDemoData = businessRecords.some((record) => record.dataSource === 'seed') || hasDemoReferenceData
    const dataLabel = loading
      ? '正在加载数据'
      : hasManualData && hasDemoData
        ? '正式 + 演示数据'
        : hasManualData
          ? '含正式录入数据'
          : hasDemoData
            ? '演示数据'
            : '暂无业务数据'
    const handleBackup = () => {
      if (!settings) return
      try {
        const filename = downloadDataBackup({ productionReports, anomalies, actions, aiMessages, settings, users })
        setBackupMessage(`备份已下载：${filename}`)
      } catch (backupError) {
        setBackupMessage(`备份失败：${backupError instanceof Error ? backupError.message : '请重试'}`)
      }
    }
    const handleDemoData = async () => {
      setDemoBusy(true)
      setDemoMessage(null)
      try {
        if (hasDemoData) {
          await appStore.clearDemoData()
          setDemoMessage('演示数据已清除；手工数据和仍被手工记录引用的资料已保留。')
        } else {
          await appStore.loadDemoData()
          setDemoMessage('演示数据已加载。')
        }
      } catch (demoError) {
        setDemoMessage(`操作失败：${demoError instanceof Error ? demoError.message : '请重试'}`)
      } finally {
        setDemoBusy(false)
      }
    }

   return (
    <div className="min-h-screen bg-[#f7f7f5] flex">
      <aside className="w-16 lg:w-60 bg-[#1e1e1e] border-r border-[#3a3a3a] flex flex-col fixed h-full z-10 text-[#d5d5d5]">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-[#3a3a3a]">
          <div className="w-9 h-9 rounded-md bg-[#fbc405] flex items-center justify-center text-[#1e1e1e]">
             <Factory size={20} />
           </div>
           <div>
             <div className="text-sm font-bold text-slate-800 leading-tight">智造运营平台</div>
             <div className="text-[10px] text-slate-500">Manufacturing OS</div>
           </div>
         </div>

         <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
           {navItems.map((item) => {
             const Icon = item.icon
             return (
               <NavLink
                 key={item.to}
                 to={item.to}
                 className={({ isActive }) =>
                   `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                     isActive
                       ? 'bg-[#303030] text-[#fbc405]'
                       : 'text-[#d5d5d5] hover:bg-[#292929] hover:text-[#fbc405]'
                   }`
                 }
               >
                 <Icon size={18} />
                 {item.label}
               </NavLink>
             )
           })}
         </nav>

         <div className="relative border-t border-[#3a3a3a] p-3">
           {demoMessage && (
             <span role="status" className={`absolute bottom-full left-3 mb-2 w-52 rounded-md border px-3 py-2 text-xs shadow-lg ${demoMessage.startsWith('操作失败') ? 'border-[#950000] bg-[#2a1717] text-[#f0b7b7]' : 'border-[#545454] bg-[#292929] text-[#d5d5d5]'}`}>
               {demoMessage}
             </span>
           )}
           <button
             type="button"
             onClick={handleDemoData}
             disabled={loading || demoBusy}
             aria-label={hasDemoData ? '清除演示数据' : '加载演示数据'}
             title={hasDemoData ? '仅清除演示数据，保留手工录入数据' : '写入虚构数据以体验完整功能'}
             className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${hasDemoData ? 'text-[#e0a1a1] hover:bg-[#2a2222] hover:text-[#f0b7b7]' : 'text-[#d5d5d5] hover:bg-[#292929] hover:text-[#fbc405]'}`}
           >
             {hasDemoData ? <Trash2 size={18} /> : <Database size={18} />}
             <span className="hidden lg:inline">{demoBusy ? '处理中…' : hasDemoData ? '清除演示数据' : '加载演示数据'}</span>
           </button>
         </div>

       </aside>

      <div className="flex-1 flex flex-col ml-16 lg:ml-60">
        <header className="h-16 bg-white border-b border-[#d5d5d5] flex items-center justify-between px-6 sticky top-0 z-10">
           <h1 className="text-lg font-semibold text-slate-800">{activeLabel}</h1>
            <div className="flex items-center gap-4">
             <span className={`hidden rounded border px-2 py-1 text-xs font-medium md:inline-flex ${error ? 'border-[#d99494] bg-[#fff1f1] text-[#950000]' : 'border-[#d5d5d5] bg-[#f7f7f5] text-[#787777]'}`} title={error ?? undefined}>{error ? '本地数据保存失败' : dataLabel}</span>
            <div className="relative">
              <button type="button" onClick={handleBackup} disabled={loading || !settings} title="下载完整本地数据备份" className="inline-flex items-center gap-1.5 rounded-md border border-[#d5d5d5] px-2.5 py-1.5 text-xs font-medium text-[#1e1e1e] transition-colors hover:border-[#e1a300] hover:bg-[#fff8df] disabled:cursor-not-allowed disabled:opacity-50">
                <Download size={15} />
                <span className="hidden lg:inline">备份数据</span>
              </button>
              {backupMessage && <span role="status" className={`absolute right-0 top-full z-20 mt-2 w-72 rounded-md border px-3 py-2 text-xs shadow-md ${backupMessage.startsWith('备份失败') ? 'border-[#d99494] bg-[#fff1f1] text-[#950000]' : 'border-[#d5d5d5] bg-white text-[#1e1e1e]'}`}>{backupMessage}</span>}
            </div>
            <button className="relative p-2 rounded-md text-[#787777] hover:bg-[#f2f2f2] transition-colors">
               <Bell size={20} />
               <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
             </button>
           </div>
         </header>

        <main className="flex-1 p-6 overflow-x-hidden bg-[#f7f7f5]">
           <Outlet />
         </main>
       </div>
     </div>
   )
 }
